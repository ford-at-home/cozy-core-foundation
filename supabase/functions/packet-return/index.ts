// Edge function: packet-return — reads a photographed packet page.
//
// The student photographs a completed page, uploads it to the private
// packet-returns bucket (folder-scoped RLS, auth.uid()/ prefix), then calls
// this function with the storage path. We:
//   1. authenticate + verify packet ownership (service role bypasses RLS,
//      so this function is the authorization boundary),
//   2. run the quality gate + multimodal handwriting recognition in one
//      Lovable-gateway call, prompted with the packet's own printed content,
//   3. persist the page + recognized blocks idempotently (retake-safe),
//   4. record the provider cost as an idempotent inference row
//      (lovable:hwr:{returnId}:{imagePath}) against the packet's run.
//
// Returning work is FREE to the student — no credit reservation anywhere in
// this function. Costs are recorded for accounting only.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRecognitionPrompt,
  parseRecognitionResult,
  persistPageRecognition,
  retakeMessage,
} from "../_shared/recognition.ts";
import { recordInference } from "../_shared/usage.ts";
import { estimateTokens } from "../_shared/token-estimate.ts";
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

const HWR_MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // matches the bucket's file_size_limit

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
  if (!Deno.env.get("LOVABLE_API_KEY")?.trim()) {
    return err(422, "Page reading is not configured (LOVABLE_API_KEY missing).", {
      requestId: rid,
      code: "recognition_disabled",
    });
  }

  // --- 1. Authenticate ------------------------------------------------------
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

  // --- 2. Validate input ----------------------------------------------------
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const packetId = typeof body?.packetId === "string" ? body.packetId : "";
  const path = typeof body?.path === "string" ? body.path : "";
  if (!packetId || !path) {
    return err(400, "packetId and path are required", { requestId: rid, code: "invalid_input" });
  }
  // Ownership of the upload itself: path must live under the caller's folder.
  if (path.split("/")[0] !== userId) {
    return err(403, "Path is not in your folder", { requestId: rid, code: "path_forbidden" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 3. Ownership: the packet must belong to the caller --------------------
  const { data: packet } = await admin
    .from("packets")
    .select("id, user_id, run_id, piece_id")
    .eq("id", packetId)
    .maybeSingle();
  if (!packet || packet.user_id !== userId) {
    return err(404, "Packet not found", { requestId: rid, code: "packet_not_found" });
  }

  logEvent(FN, "info", { requestId: rid, userId, packetId, path });

  // --- 4. Ensure the return row (one per packet; idempotent) -----------------
  const { error: retErr } = await admin
    .from("packet_returns")
    .upsert(
      { packet_id: packetId, user_id: userId },
      { onConflict: "packet_id", ignoreDuplicates: true },
    );
  if (retErr) {
    return err(500, "Could not open a return for this packet", {
      requestId: rid,
      code: "return_upsert_failed",
      cause: retErr,
    });
  }
  const { data: ret } = await admin
    .from("packet_returns")
    .select("id, status")
    .eq("packet_id", packetId)
    .maybeSingle();
  if (!ret) {
    return err(500, "Return row not readable", { requestId: rid, code: "return_missing" });
  }

  // --- 5. Download the photo --------------------------------------------------
  const { data: blob, error: dlErr } = await admin.storage.from("packet-returns").download(path);
  if (dlErr || !blob) {
    return err(404, "Uploaded photo not found in storage", {
      requestId: rid,
      code: "image_missing",
      cause: dlErr,
    });
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
    return err(413, "Photo is empty or too large", { requestId: rid, code: "image_size" });
  }

  // --- 6. Assemble the packet context for the recognition prompt -------------
  const [{ data: run }, { data: questions }, { data: profile }] = await Promise.all([
    admin.from("agent_runs").select("id, result").eq("id", packet.run_id).maybeSingle(),
    admin
      .from("packet_questions")
      .select("id, position, prompt, function")
      .eq("packet_id", packetId)
      .order("position", { ascending: true }),
    admin
      .from("handwriting_profiles")
      .select("profile_text")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const packetBody = packetBodyFromResult(run?.result) ?? "";
  // Print order matches src/lib/packets.ts: followup section last.
  const ordered = [
    ...(questions ?? []).filter((q: any) => q.function !== "followup"),
    ...(questions ?? []).filter((q: any) => q.function === "followup"),
  ];
  const promptQuestions = ordered.map((q: any, i: number) => ({
    number: i + 1,
    prompt: String(q.prompt ?? ""),
  }));
  const questionIdsByNumber = new Map<number, string>(
    ordered.map((q: any, i: number) => [i + 1, q.id as string]),
  );

  const prompt = buildRecognitionPrompt({
    packetBody,
    questions: promptQuestions,
    handwritingProfile: profile?.profile_text ?? null,
  });

  // --- 7. One multimodal call: quality gate + recognition ---------------------
  const contentType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const dataUrl = `data:${contentType};base64,${bytesToBase64(buf)}`;
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    },
    body: JSON.stringify({
      model: HWR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return err(502, `Page reading failed (${res.status}). Your photo is saved — try again.`, {
      requestId: rid,
      code: "gateway_error",
      details: { status: res.status, detail: detail.slice(0, 200) },
    });
  }
  const gw = (await res.json().catch(() => null)) as any;
  const rawText = gw?.choices?.[0]?.message?.content;
  if (typeof rawText !== "string" || !rawText) {
    return err(502, "Page reading returned nothing. Your photo is saved — try again.", {
      requestId: rid,
      code: "empty_response",
    });
  }

  let outcome;
  try {
    outcome = parseRecognitionResult(rawText);
  } catch (cause) {
    return err(502, "Page reading produced an unreadable result. Your photo is saved — try again.", {
      requestId: rid,
      code: "parse_failed",
      cause,
    });
  }

  // --- 8. Record the provider cost (idempotent; free to the student) ---------
  try {
    await recordInference(admin, {
      runId: packet.run_id,
      provider: "lovable",
      model: HWR_MODEL,
      operationType: "llm",
      idempotencyKey: `lovable:hwr:${ret.id}:${path}`,
      inputTokens: estimateTokens(prompt) + Math.ceil(buf.length / 4),
      outputTokens: estimateTokens(rawText),
      metadata: {
        subtype: "handwriting_recognition",
        packet_id: packetId,
        return_id: ret.id,
        image_bytes: buf.length,
        quality_ok: outcome.quality.ok,
        blocks: outcome.blocks.length,
      },
      rawPayload: { path, image_bytes: buf.length, quality: outcome.quality },
    });
  } catch (recErr) {
    logEvent(FN, "warn", {
      requestId: rid,
      event: "hwr_usage_record_failed",
      message: recErr instanceof Error ? recErr.message : String(recErr),
    });
  }

  // --- 9. Persist (idempotent, retake-safe) -----------------------------------
  const persisted = await persistPageRecognition(admin, {
    returnId: ret.id,
    userId,
    storagePath: path,
    outcome,
    questionIdsByNumber,
  });

  return json(
    {
      returnId: ret.id,
      pageImageId: persisted.pageImageId,
      status: persisted.status,
      pageNumber: outcome.page_number,
      quality: outcome.quality,
      retakeMessage: outcome.quality.ok ? null : retakeMessage(outcome.quality.problems),
      blocks: outcome.blocks.length,
    },
    200,
    rid,
  );
}

function packetBodyFromResult(result: any): string | null {
  if (!result || !Array.isArray(result.channels)) return null;
  for (const ch of result.channels) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files) {
      if (f?.name === "post.md" && typeof f.content === "string") return f.content;
    }
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
