// Edge function: packet-return — read the student's returned packet pages.
//
// The owner collects page photos (and/or dictation) under a packet_returns
// row, then asks for recognition. This function:
//   1. verifies ownership (service role bypasses RLS — explicit check),
//   2. quality-checks and recognizes each un-recognized page via the Lovable
//      AI gateway multimodal model (same gateway as the start-workflow OCR
//      path), with per-page retake feedback,
//   3. appends recognized_blocks (attempt-versioned; earlier attempts stay
//      auditable) and never fabricates unreadable text,
//   4. moves the return to needs_review — recognition output is NEVER
//      auto-verified; the student's review is a mandatory step.
//
// Costs: provider usage is recorded as inferences against the packet's
// generation run (idempotency key lovable:hwr:{returnId}:{path}:a{attempt});
// recognition consumes NO user credits (returning work is free).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  blocksToRows,
  buildRecognitionPrompt,
  parseRecognitionResult,
  type RecognitionQuestionContext,
} from "../_shared/recognition.ts";
import { recordInference } from "../_shared/usage.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  logEvent,
  newRequestId,
} from "../_shared/observability.ts";

const FN = "packet-return";
const json = (body: unknown, status = 200, rid?: string) => jsonResponse(body, status, rid);
const err = (
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
) => errorResponse(FN, status, message, opts);

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RECOGNITION_MODEL = "google/gemini-2.5-flash";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // matches the bucket limit

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const rid = newRequestId();
  if (req.method !== "POST") return err(405, "Method not allowed", { requestId: rid });
  try {
    return await handle(req, rid);
  } catch (e) {
    return err(500, "Unhandled server error", { requestId: rid, code: "unhandled", cause: e });
  }
});

async function handle(req: Request, rid: string): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return err(500, "Server misconfigured", { requestId: rid, code: "env_missing" });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return err(401, "Unauthorized", { requestId: rid, code: "no_token" });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return err(401, "Unauthorized", { requestId: rid, code: "invalid_token", cause: userErr });
  }
  const userId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const returnId = typeof body?.returnId === "string" ? body.returnId : "";
  if (!returnId) {
    return err(400, "returnId is required", { requestId: rid, code: "invalid_input" });
  }
  logEvent(FN, "info", { requestId: rid, userId, returnId });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership check (explicit — service role bypasses RLS).
  const { data: ret } = await admin
    .from("packet_returns")
    .select("id, user_id, packet_id, piece_id, status")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret || ret.user_id !== userId) {
    return err(404, "Return not found", { requestId: rid, code: "return_not_found" });
  }
  if (ret.status === "verified") {
    return err(409, "This return is already verified.", {
      requestId: rid,
      code: "already_verified",
    });
  }
  if (ret.status === "recognizing") {
    // A concurrent duplicate request: report progress instead of re-running.
    return json({ returnId, status: "recognizing" }, 202, rid);
  }

  const { data: packet } = await admin
    .from("packets")
    .select("id, run_id")
    .eq("id", ret.packet_id)
    .maybeSingle();

  const { data: questionRows } = await admin
    .from("packet_questions")
    .select("id, position, prompt")
    .eq("packet_id", ret.packet_id)
    .order("position", { ascending: true });
  const questions: RecognitionQuestionContext[] = (questionRows ?? []).map((q: any) => ({
    id: q.id,
    position: q.position,
    prompt: q.prompt,
  }));

  const { data: pages } = await admin
    .from("page_images")
    .select("id, storage_path, status, position, page_number")
    .eq("return_id", returnId)
    .order("position", { ascending: true });
  const allPages = pages ?? [];

  const { count: segmentCount } = await admin
    .from("dictation_segments")
    .select("id", { count: "exact", head: true })
    .eq("return_id", returnId);

  if (allPages.length === 0 && (segmentCount ?? 0) === 0) {
    return err(422, "Nothing to read yet — add page photos or dictation first.", {
      requestId: rid,
      code: "empty_return",
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (allPages.length > 0 && !apiKey) {
    return err(500, "Recognition is not configured (missing gateway key).", {
      requestId: rid,
      code: "gateway_missing",
    });
  }

  await admin
    .from("packet_returns")
    .update({ status: "recognizing", error: null, updated_at: new Date().toISOString() })
    .eq("id", returnId);

  // Re-recognition only touches pages that aren't already recognized, so a
  // retried request is a no-op for pages that succeeded (idempotent per
  // page; blocks are attempt-versioned and unique on (page, attempt, pos)).
  const pending = allPages.filter((p: any) => p.status !== "recognized");
  const prompt = buildRecognitionPrompt(questions);
  const pageResults: Array<{
    pageImageId: string;
    status: "recognized" | "rejected" | "failed";
    issues: Array<{ code: string; message: string }>;
    blocks: number;
  }> = [];

  for (const page of pending) {
    const outcome = await recognizePage(admin, {
      page,
      returnId,
      userId,
      prompt,
      questions,
      apiKey: apiKey ?? "",
      packetRunId: packet?.run_id ?? null,
      rid,
    });
    pageResults.push(outcome);
  }

  // Terminal bookkeeping: the return is reviewable when any content exists
  // (recognized pages, earlier recognized pages, or dictation). If every
  // page was rejected/failed and there's no dictation, hand it back to
  // collecting with the retake guidance.
  const anyRecognized =
    allPages.some((p: any) => p.status === "recognized") ||
    pageResults.some((r) => r.status === "recognized");
  const hasDictation = (segmentCount ?? 0) > 0;

  let nextStatus: string;
  let errorText: string | null = null;
  if (anyRecognized || hasDictation) {
    nextStatus = "needs_review";
    const problemPages = pageResults.filter((r) => r.status !== "recognized");
    if (problemPages.length > 0) {
      errorText = `${problemPages.length} page(s) need a retake — see the page list.`;
    }
  } else {
    nextStatus = "collecting";
    errorText =
      "None of the pages could be read. Retake them with more light, no glare, and the full page in frame.";
  }
  await admin
    .from("packet_returns")
    .update({ status: nextStatus, error: errorText, updated_at: new Date().toISOString() })
    .eq("id", returnId);

  logEvent(FN, "info", {
    requestId: rid,
    event: "recognition_done",
    returnId,
    pages: pageResults.length,
    status: nextStatus,
  });
  return json({ returnId, status: nextStatus, pages: pageResults }, 200, rid);
}

async function recognizePage(
  admin: any,
  args: {
    page: any;
    returnId: string;
    userId: string;
    prompt: string;
    questions: RecognitionQuestionContext[];
    apiKey: string;
    packetRunId: string | null;
    rid: string;
  },
): Promise<{
  pageImageId: string;
  status: "recognized" | "rejected" | "failed";
  issues: Array<{ code: string; message: string }>;
  blocks: number;
}> {
  const { page, returnId, userId, rid } = args;
  const fail = async (message: string) => {
    await admin
      .from("page_images")
      .update({
        status: "failed",
        quality: { ok: false, issues: [{ code: "error", message }] },
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id);
    return {
      pageImageId: page.id,
      status: "failed" as const,
      issues: [{ code: "error", message }],
      blocks: 0,
    };
  };

  // 1. Download the image (service role; ownership was verified above).
  const { data: blob, error: dlErr } = await admin.storage
    .from("packet-returns")
    .download(page.storage_path);
  if (dlErr || !blob) return await fail("Could not read the uploaded photo.");
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) return await fail("Photo is too large to process.");
  const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const dataUrl = `data:${mime};base64,${bytesToBase64(buf)}`;

  // 2. Gateway call.
  const started = Date.now();
  let raw = "";
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.apiKey}` },
      body: JSON.stringify({
        model: RECOGNITION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: args.prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      logEvent(FN, "warn", {
        requestId: rid,
        event: "gateway_error",
        pageImageId: page.id,
        status: res.status,
      });
      return await fail("The reading service had a temporary problem. Try again in a minute.");
    }
    const body = (await res.json().catch(() => null)) as any;
    raw = typeof body?.choices?.[0]?.message?.content === "string"
      ? body.choices[0].message.content
      : "";
  } catch (e) {
    logEvent(FN, "warn", {
      requestId: rid,
      event: "gateway_fetch_failed",
      pageImageId: page.id,
      message: e instanceof Error ? e.message : String(e),
    });
    return await fail("Could not reach the reading service. Try again in a minute.");
  }

  // 3. Parse + persist.
  let parsed;
  try {
    parsed = parseRecognitionResult(raw);
  } catch {
    return await fail("The page could not be interpreted. Try a clearer photo.");
  }

  // Attempt number: one past the highest existing attempt for this page.
  const { data: prior } = await admin
    .from("recognized_blocks")
    .select("attempt")
    .eq("page_image_id", page.id)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const attempt = (prior?.attempt ?? 0) + 1;

  // Provider cost — recorded against the packet's generation run so it rolls
  // into the piece's session. Idempotent per (return, path, attempt).
  if (args.packetRunId) {
    try {
      await recordInference(admin, {
        runId: args.packetRunId,
        provider: "lovable",
        model: RECOGNITION_MODEL,
        operationType: "llm",
        idempotencyKey: `lovable:hwr:${returnId}:${page.storage_path}:a${attempt}`,
        durationMs: Date.now() - started,
        inputTokens: Math.ceil(buf.length / 4) + Math.ceil(args.prompt.length / 4),
        outputTokens: Math.ceil(raw.length / 4),
        metadata: {
          subtype: "handwriting_recognition",
          return_id: returnId,
          page_image_id: page.id,
          attempt,
          image_bytes: buf.length,
        },
        rawPayload: { page_image_id: page.id, attempt, blocks: parsed.blocks.length },
      });
    } catch (e) {
      logEvent(FN, "warn", {
        requestId: rid,
        event: "hwr_usage_record_failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!parsed.quality.ok) {
    await admin
      .from("page_images")
      .update({
        status: "rejected",
        quality: parsed.quality,
        page_number: page.page_number ?? parsed.page_number,
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id);
    return {
      pageImageId: page.id,
      status: "rejected",
      issues: parsed.quality.issues,
      blocks: 0,
    };
  }

  const rows = blocksToRows({
    pageImageId: page.id,
    returnId,
    userId,
    attempt,
    blocks: parsed.blocks,
    questions: args.questions,
  });
  if (rows.length > 0) {
    // ignoreDuplicates on (page_image_id, attempt, position): a race between
    // duplicate requests can never double-insert an attempt's blocks.
    const { error: insErr } = await admin
      .from("recognized_blocks")
      .upsert(rows, { onConflict: "page_image_id,attempt,position", ignoreDuplicates: true });
    if (insErr) return await fail(`Could not save what was read: ${insErr.message}`);
  }

  await admin
    .from("page_images")
    .update({
      status: "recognized",
      quality: parsed.quality,
      page_number: page.page_number ?? parsed.page_number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", page.id);

  return {
    pageImageId: page.id,
    status: "recognized",
    issues: parsed.quality.issues,
    blocks: rows.length,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
