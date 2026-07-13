// Edge function: final-artifacts — the final paper (.docx) and class
// presentation (.pptx), Phases 6–7 of docs/research-workflow/.
//
// Unlike agent-dispatched runs, these execute INLINE (one gateway synthesis
// call + local file assembly + storage upload), so the run walks the state
// machine synchronously: dispatching → running → awaiting_fetch → completed.
// A crash strands the run in `running`; the reconciler fails inline runs
// older than its timeout and releases the hold (retry = a fresh request).
//
// Money rules: 1 credit per generation (CREDIT_COST.document /
// .presentation), reserved before work, settled at completion, released on
// failure. Downloads and re-downloads are free. The presentation requires a
// completed paper — it is built FROM the paper's spec (separate,
// independently retryable jobs per the spec).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildDocumentPrompt,
  buildPresentationPrompt,
  buildVerifiedMaterial,
  parseDocumentSpec,
  parsePresentationSpec,
  type DocumentSpec,
} from "../_shared/artifacts.ts";
import { buildDocx, buildPptx } from "../_shared/artifact-files.ts";
import { ensureRunSession, recordInference } from "../_shared/usage.ts";
import { estimateTokens } from "../_shared/token-estimate.ts";
import {
  CREDIT_COST,
  creditsEnforced,
  getBalance,
  releaseRunCredits,
  reserveCreditsForRun,
  settleRunCredits,
} from "../_shared/credits.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  logEvent,
  newRequestId,
} from "../_shared/observability.ts";

const FN = "final-artifacts";
const json = (body: unknown, status = 200, rid?: string) => jsonResponse(body, status, rid);
const err = (
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
) => errorResponse(FN, status, message, opts);

const SYNTHESIS_MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const KINDS = ["document", "presentation"] as const;
type ArtifactKind = (typeof KINDS)[number];

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
    return err(422, "Final materials are not configured (LOVABLE_API_KEY missing).", {
      requestId: rid,
      code: "synthesis_disabled",
    });
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
  const pieceId = typeof body?.pieceId === "string" ? body.pieceId : "";
  const kind = KINDS.includes(body?.kind) ? (body.kind as ArtifactKind) : null;
  const requestId =
    typeof body?.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  if (!pieceId || !kind) {
    return err(400, "pieceId and kind (document|presentation) are required", {
      requestId: rid,
      code: "invalid_input",
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership (this function is the authorization boundary).
  const { data: piece } = await admin
    .from("pieces")
    .select("id, user_id, slug, title")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece || piece.user_id !== userId) {
    return err(404, "Piece not found", { requestId: rid, code: "piece_not_found" });
  }

  logEvent(FN, "info", { requestId: rid, userId, pieceId, kind, clientRequestId: requestId });

  // Idempotency: a retried submission returns the existing run.
  const idempotencyKey = `${kind}:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      logEvent(FN, "info", { requestId: rid, event: "idempotent_hit", runId: existing.id });
      return json({ runId: existing.id, pieceId }, 202, rid);
    }
  }

  // ---- Prerequisites (checked before any money moves) ----------------------
  // The paper is built from VERIFIED material: latest packet + verified return.
  const { data: packet } = await admin
    .from("packets")
    .select("id, run_id, version, followup_state")
    .eq("piece_id", pieceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!packet) {
    return err(409, "No packet exists for this project yet.", {
      requestId: rid,
      code: "no_packet",
    });
  }
  // The verified return lives on the packet the student worked through —
  // find any verified return across this piece's packets.
  const { data: packetsForPiece } = await admin
    .from("packets")
    .select("id")
    .eq("piece_id", pieceId);
  const packetIds = (packetsForPiece ?? []).map((p: any) => p.id);
  const { data: verifiedReturn } = await admin
    .from("packet_returns")
    .select("id, packet_id, status")
    .in("packet_id", packetIds.length > 0 ? packetIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  if (!verifiedReturn) {
    return err(409, "Return your work and confirm the reading before creating final materials.", {
      requestId: rid,
      code: "return_not_verified",
    });
  }

  // The presentation is built FROM the completed paper.
  let paperSpec: DocumentSpec | null = null;
  if (kind === "presentation") {
    const { data: paper } = await admin
      .from("final_artifacts")
      .select("id, spec")
      .eq("piece_id", pieceId)
      .eq("kind", "document")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!paper?.spec) {
      return err(409, "Create the final paper first — the presentation is built from it.", {
        requestId: rid,
        code: "paper_required",
      });
    }
    paperSpec = paper.spec as DocumentSpec;
  }

  // ---- Credits: pre-check, insert run, reserve ------------------------------
  const creditCost = CREDIT_COST[kind];
  if (creditsEnforced()) {
    const balance = await getBalance(admin, userId);
    if (balance < creditCost) {
      return err(402, "Not enough credits for this generation.", {
        requestId: rid,
        code: "insufficient_credits",
        details: { balance, required: creditCost },
      });
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      piece_id: pieceId,
      kind,
      status: "dispatching",
      idempotency_key: idempotencyKey,
      input: { workflow: "research_packet", packet_id: packet.id, artifact: kind },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId }, 202, rid);
    return err(500, insertErr?.message ?? "Insert failed", {
      requestId: rid,
      code: "run_insert_failed",
      cause: insertErr,
    });
  }
  const runId = inserted.id as string;
  logEvent(FN, "info", { requestId: rid, event: "run_created", runId, kind });

  const reserved = await reserveCreditsForRun(admin, {
    userId,
    runId,
    amount: creditCost,
    reason: kind === "document" ? "final paper" : "class presentation",
  });
  if (!reserved.ok) {
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error:
          reserved.code === "insufficient_credits"
            ? "Not enough credits for this generation."
            : "Credit reservation failed; you were not charged.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (reserved.code === "insufficient_credits") {
      return err(402, "Not enough credits for this generation.", {
        requestId: rid,
        code: "insufficient_credits",
        details: { balance: reserved.balance, required: creditCost },
      });
    }
    return err(500, "Credit reservation failed; you were not charged.", {
      requestId: rid,
      code: "reserve_failed",
    });
  }

  await ensureRunSession(admin, {
    runId,
    userId,
    pieceId,
    title: piece.title ?? piece.slug,
    provider: "lovable",
  });

  // ---- Inline execution ------------------------------------------------------
  // State machine respected step by step: dispatching → running → awaiting_fetch
  // → completed. Any throw fails the run and releases the hold.
  await admin
    .from("agent_runs")
    .update({ status: "running", dispatched_at: new Date().toISOString() })
    .eq("id", runId);
  try {
    const artifact =
      kind === "document"
        ? await generateDocument(admin, { runId, userId, piece, packet })
        : await generatePresentation(admin, {
            runId,
            userId,
            piece,
            packet,
            paperSpec: paperSpec!,
          });

    await admin.from("agent_runs").update({ status: "awaiting_fetch" }).eq("id", runId);
    await admin
      .from("agent_runs")
      .update({
        status: "completed",
        result: {
          artifact: {
            id: artifact.id,
            kind,
            title: artifact.title,
            storage_path: artifact.storagePath,
          },
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await settleRunCredits(admin, { id: runId }, "edge");
    return json(
      {
        runId,
        artifactId: artifact.id,
        kind,
        title: artifact.title,
        storagePath: artifact.storagePath,
      },
      200,
      rid,
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error: `Generation failed: ${message}. You were not charged — try again.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await releaseRunCredits(admin, { id: runId }, "final artifact generation failed", "edge");
    return err(502, "Generation failed. You were not charged — try again.", {
      requestId: rid,
      code: "generation_failed",
      cause,
    });
  }
}

// ---------------------------------------------------------------------------

async function generateDocument(
  admin: any,
  args: { runId: string; userId: string; piece: any; packet: any },
): Promise<{ id: string; title: string; storagePath: string }> {
  // Evidence base: the latest packet's body + the reports behind it.
  const { data: packetRun } = await admin
    .from("agent_runs")
    .select("id, input, result")
    .eq("id", args.packet.run_id)
    .maybeSingle();
  const packetBody = fileFromResult(packetRun?.result, "post.md") ?? "";
  const originalReport =
    typeof packetRun?.input?.research === "string" ? packetRun.input.research : "";
  if (!packetBody && !originalReport) throw new Error("packet content not readable");

  // Follow-up findings, when a follow-up pass completed for this piece.
  const { data: followupRun } = await admin
    .from("agent_runs")
    .select("id, result")
    .eq("piece_id", args.piece.id)
    .eq("kind", "followup_research")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const followupReport = fileFromResult(followupRun?.result, "research.md");

  // The student contribution model: verified material only.
  const { data: verifiedReturn } = await admin
    .from("packet_returns")
    .select("id, packet_id")
    .in("packet_id", await packetIdsForPiece(admin, args.piece.id))
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  let verifiedMaterial = "";
  if (verifiedReturn) {
    const [{ data: questions }, { data: blocks }, { data: segments }, { data: corrections }] =
      await Promise.all([
        admin
          .from("packet_questions")
          .select("id, position, prompt")
          .eq("packet_id", verifiedReturn.packet_id)
          .order("position", { ascending: true }),
        admin
          .from("recognized_blocks")
          .select("id, text, annotation_type, location, linked_question_id, linked_anchor")
          .eq("return_id", verifiedReturn.id),
        admin
          .from("dictation_segments")
          .select("id, transcript, resolved_target")
          .eq("return_id", verifiedReturn.id),
        admin
          .from("verification_corrections")
          .select("block_id, segment_id, corrected_text")
          .eq("return_id", verifiedReturn.id),
      ]);
    verifiedMaterial = buildVerifiedMaterial({
      questions: questions ?? [],
      blocks: blocks ?? [],
      segments: segments ?? [],
      corrections: corrections ?? [],
    });
  }

  const topic =
    (typeof packetRun?.input?.topic === "string" && packetRun.input.topic) ||
    args.piece.title ||
    args.piece.slug;
  const prompt = buildDocumentPrompt({
    topic,
    packetBody: packetBody || originalReport,
    verifiedMaterial,
    followupReport,
  });
  const rawText = await callGateway(admin, args.runId, prompt, "final_paper_synthesis");

  // Provenance: citations must exist in the source material.
  const allowedSourceText = [packetBody, originalReport, followupReport ?? ""].join("\n");
  const { spec, droppedReferences } = parseDocumentSpec(rawText, allowedSourceText);
  if (droppedReferences > 0) {
    await admin.from("agent_run_events").insert({
      run_id: args.runId,
      source: "edge",
      event_type: "references_dropped",
      payload: { droppedReferences },
    });
  }

  const bytes = await buildDocx(spec);
  const storagePath = `${args.userId}/${args.piece.id}/final-paper-${args.runId}.docx`;
  await uploadArtifact(
    admin,
    storagePath,
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );

  const artifactId = await insertArtifactRow(admin, {
    pieceId: args.piece.id,
    packetId: args.packet.id,
    runId: args.runId,
    userId: args.userId,
    kind: "document",
    title: spec.title,
    storagePath,
    spec,
  });
  return { id: artifactId, title: spec.title, storagePath };
}

async function generatePresentation(
  admin: any,
  args: { runId: string; userId: string; piece: any; packet: any; paperSpec: DocumentSpec },
): Promise<{ id: string; title: string; storagePath: string }> {
  const prompt = buildPresentationPrompt(args.paperSpec);
  const rawText = await callGateway(admin, args.runId, prompt, "presentation_synthesis");
  const spec = parsePresentationSpec(rawText);

  const bytes = await buildPptx(spec);
  const storagePath = `${args.userId}/${args.piece.id}/presentation-${args.runId}.pptx`;
  await uploadArtifact(
    admin,
    storagePath,
    bytes,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );

  const artifactId = await insertArtifactRow(admin, {
    pieceId: args.piece.id,
    packetId: args.packet.id,
    runId: args.runId,
    userId: args.userId,
    kind: "presentation",
    title: spec.title,
    storagePath,
    spec,
  });
  return { id: artifactId, title: spec.title, storagePath };
}

// ---------------------------------------------------------------------------

async function callGateway(
  admin: any,
  runId: string,
  prompt: string,
  subtype: string,
): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    },
    body: JSON.stringify({
      model: SYNTHESIS_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`synthesis gateway ${res.status}: ${detail.slice(0, 200)}`);
  }
  const gw = (await res.json().catch(() => null)) as any;
  const rawText = gw?.choices?.[0]?.message?.content;
  if (typeof rawText !== "string" || !rawText) throw new Error("synthesis returned nothing");

  try {
    await recordInference(admin, {
      runId,
      provider: "lovable",
      model: SYNTHESIS_MODEL,
      operationType: "llm",
      idempotencyKey: `lovable:synthesis:${runId}`,
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(rawText),
      metadata: { subtype },
    });
  } catch (err) {
    logEvent(FN, "warn", {
      event: "synthesis_usage_record_failed",
      runId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return rawText;
}

async function uploadArtifact(
  admin: any,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await admin.storage
    .from("final-artifacts")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`artifact upload failed: ${error.message}`);
}

async function insertArtifactRow(
  admin: any,
  args: {
    pieceId: string;
    packetId: string;
    runId: string;
    userId: string;
    kind: ArtifactKind;
    title: string;
    storagePath: string;
    spec: unknown;
  },
): Promise<string> {
  const { error } = await admin.from("final_artifacts").upsert(
    {
      piece_id: args.pieceId,
      packet_id: args.packetId,
      run_id: args.runId,
      user_id: args.userId,
      kind: args.kind,
      title: args.title,
      storage_path: args.storagePath,
      spec: args.spec,
    },
    { onConflict: "run_id", ignoreDuplicates: false },
  );
  if (error) throw new Error(`artifact row insert failed: ${error.message}`);
  const { data } = await admin
    .from("final_artifacts")
    .select("id")
    .eq("run_id", args.runId)
    .maybeSingle();
  if (!data) throw new Error("artifact row not readable after insert");
  return data.id as string;
}

async function packetIdsForPiece(admin: any, pieceId: string): Promise<string[]> {
  const { data } = await admin.from("packets").select("id").eq("piece_id", pieceId);
  const ids = (data ?? []).map((p: any) => p.id as string);
  return ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
}

function fileFromResult(result: any, name: string): string | null {
  if (!result || !Array.isArray(result.channels)) return null;
  for (const ch of result.channels) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files) {
      if ((f?.name === name || f?.name === "post.md") && typeof f.content === "string") {
        if (f.name === name) return f.content;
      }
    }
  }
  // Fallback: the first file (research runs store research.md; packet runs post.md).
  const first = result.channels?.[0]?.files?.[0];
  return typeof first?.content === "string" ? first.content : null;
}
