// Edge function: packet-action — the follow-up research loop (Phase 5).
//
//   refine_followups        — free. Suggest sharper phrasings for the
//                             student's submitted follow-up questions via the
//                             Lovable gateway. Visible and consensual: the
//                             suggestion is stored BESIDE the student's
//                             wording; the student chooses what to approve.
//   start_followup_research — 2 credits (CREDIT_COST.followup, covering the
//                             chained revised packet). Dispatches one
//                             targeted Parallel research pass carrying the
//                             original report + the approved questions; the
//                             research reconciler chains packet v(n+1).
//
// Same controller rules as start-workflow: authenticated caller, explicit
// ownership checks (service role bypasses RLS), insert-before-dispatch,
// idempotent on requestId, reserve-before-dispatch.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MAX_FOLLOWUP_QUESTIONS,
  buildFollowupQuery,
  buildRefinementPrompt,
  parseRefinementResult,
  type FollowupQuestion,
} from "../_shared/followup.ts";
import { dispatchResearchRun } from "../_shared/dispatch.ts";
import { resolveProcessor } from "../_shared/parallel.ts";
import { ensureRunSession, recordInference } from "../_shared/usage.ts";
import { estimateTokens } from "../_shared/token-estimate.ts";
import {
  CREDIT_COST,
  creditsEnforced,
  getBalance,
  reserveCreditsForRun,
} from "../_shared/credits.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  logEvent,
  newRequestId,
} from "../_shared/observability.ts";

const FN = "packet-action";
const json = (body: unknown, status = 200, rid?: string) => jsonResponse(body, status, rid);
const err = (
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
) => errorResponse(FN, status, message, opts);

const REFINE_MODEL = "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
  const action = typeof body?.action === "string" ? body.action : "";
  const packetId = typeof body?.packetId === "string" ? body.packetId : "";
  const requestId =
    typeof body?.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  if (!packetId || !["refine_followups", "start_followup_research"].includes(action)) {
    return err(400, "packetId and a valid action are required", {
      requestId: rid,
      code: "invalid_input",
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership (the authorization boundary — service role bypasses RLS).
  const { data: packet } = await admin
    .from("packets")
    .select("id, user_id, piece_id, run_id, version, followup_state")
    .eq("id", packetId)
    .maybeSingle();
  if (!packet || packet.user_id !== userId) {
    return err(404, "Packet not found", { requestId: rid, code: "packet_not_found" });
  }

  logEvent(FN, "info", { requestId: rid, userId, packetId, action, clientRequestId: requestId });

  if (action === "refine_followups") {
    return await refineFollowups(admin, rid, packet);
  }
  return await startFollowupResearch(admin, rid, userId, packet, requestId);
}

// --- refine_followups (free; cost recorded against the packet's run) --------

async function refineFollowups(admin: any, rid: string, packet: any): Promise<Response> {
  const { data: rows } = await admin
    .from("followup_questions")
    .select("id, position, student_text, status")
    .eq("packet_id", packet.id)
    .in("status", ["submitted", "refined"])
    .order("position", { ascending: true });
  const questions: FollowupQuestion[] = (rows ?? []).map((r: any) => ({
    position: r.position,
    text: String(r.student_text ?? ""),
  }));
  if (questions.length === 0) {
    return json({ refined: 0 }, 200, rid);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (!apiKey) return json({ refined: 0, disabled: true }, 200, rid);

  const prompt = buildRefinementPrompt(questions);
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: REFINE_MODEL, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    // Refinement is best-effort: the student's wording always stands on its own.
    return json({ refined: 0 }, 200, rid);
  }
  const gw = (await res.json().catch(() => null)) as any;
  const rawText = gw?.choices?.[0]?.message?.content;
  const suggestions = typeof rawText === "string" ? parseRefinementResult(rawText) : [];

  try {
    const textHash = await sha256Hex(questions.map((q) => `${q.position}:${q.text}`).join("|"));
    await recordInference(admin, {
      runId: packet.run_id,
      provider: "lovable",
      model: REFINE_MODEL,
      operationType: "llm",
      idempotencyKey: `lovable:refine:${packet.id}:${textHash}`,
      inputTokens: estimateTokens(prompt),
      outputTokens: estimateTokens(typeof rawText === "string" ? rawText : ""),
      metadata: {
        subtype: "followup_refinement",
        packet_id: packet.id,
        questions: questions.length,
      },
    });
  } catch (recErr) {
    logEvent(FN, "warn", {
      requestId: rid,
      event: "refine_usage_record_failed",
      message: recErr instanceof Error ? recErr.message : String(recErr),
    });
  }

  let refined = 0;
  for (const s of suggestions) {
    const row = (rows ?? []).find((r: any) => r.position === s.position);
    if (!row) continue;
    const { error } = await admin
      .from("followup_questions")
      .update({
        suggested_text: s.suggested,
        status: "refined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (!error) refined++;
  }
  return json({ refined }, 200, rid);
}

// --- start_followup_research (2 credits; chains the revised packet) ---------

async function startFollowupResearch(
  admin: any,
  rid: string,
  userId: string,
  packet: any,
  requestId: string,
): Promise<Response> {
  if (!Deno.env.get("PARALLEL_API_KEY")?.trim()) {
    return err(422, "Follow-up research is not configured (PARALLEL_API_KEY missing).", {
      requestId: rid,
      code: "research_disabled",
    });
  }

  // Idempotency: a retried submission returns the existing run.
  const idempotencyKey = `followup:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      logEvent(FN, "info", { requestId: rid, event: "idempotent_hit", runId: existing.id });
      return json({ runId: existing.id, pieceId: existing.piece_id }, 202, rid);
    }
  }

  if (packet.followup_state === "researching" || packet.followup_state === "researched") {
    return err(409, "Follow-up research already started for this packet.", {
      requestId: rid,
      code: "followup_already_started",
    });
  }

  // The loop's order is fixed: return your work and confirm the reading first.
  // (The read check above is a fast path; the authoritative, race-proof claim
  // of followup_state happens right before the run insert below.)
  const { data: ret } = await admin
    .from("packet_returns")
    .select("status")
    .eq("packet_id", packet.id)
    .maybeSingle();
  if (ret?.status !== "verified") {
    return err(409, "Confirm the reading of your returned work before follow-up research.", {
      requestId: rid,
      code: "return_not_verified",
    });
  }

  const { data: approvedRows } = await admin
    .from("followup_questions")
    .select("id, position, approved_text, student_text, status")
    .eq("packet_id", packet.id)
    .eq("status", "approved")
    .order("position", { ascending: true });
  const questions: FollowupQuestion[] = (approvedRows ?? [])
    .map((r: any) => ({
      position: r.position,
      text: String(r.approved_text ?? r.student_text ?? "").trim(),
    }))
    .filter((q: FollowupQuestion) => q.text.length > 0)
    .slice(0, MAX_FOLLOWUP_QUESTIONS);
  if (questions.length === 0) {
    return err(422, "Approve at least one follow-up question first.", {
      requestId: rid,
      code: "no_approved_questions",
    });
  }

  // Original run: the report it was built from, the branch its files live
  // on, and the packet body — everything the revision chain needs.
  const [{ data: originalRun }, { data: piece }] = await Promise.all([
    admin
      .from("agent_runs")
      .select("id, input, branch, result")
      .eq("id", packet.run_id)
      .maybeSingle(),
    admin.from("pieces").select("id, user_id, slug, title").eq("id", packet.piece_id).maybeSingle(),
  ]);
  if (!piece || piece.user_id !== userId) {
    return err(404, "Piece not found", { requestId: rid, code: "piece_not_found" });
  }
  const originalReport =
    typeof originalRun?.input?.research === "string" ? originalRun.input.research : "";
  const topic =
    (typeof originalRun?.input?.topic === "string" && originalRun.input.topic) ||
    piece.title ||
    piece.slug;
  const goal = typeof originalRun?.input?.goal === "string" ? originalRun.input.goal : null;
  const originalPacketBody = packetBodyFromResult(originalRun?.result) ?? "";

  // Credits: cheap pre-check; the authoritative check is the reservation.
  const creditCost = CREDIT_COST.followup;
  if (creditsEnforced()) {
    const balance = await getBalance(admin, userId);
    if (balance < creditCost) {
      return err(402, "Not enough credits for follow-up research.", {
        requestId: rid,
        code: "insufficient_credits",
        details: { balance, required: creditCost },
      });
    }
  }

  // Atomically claim the packet: exactly one concurrent submission wins,
  // even with distinct requestIds (a double-tap generates two). Losers get
  // the same 409 as the fast-path check above.
  const { data: claimed } = await admin
    .from("packets")
    .update({ followup_state: "researching", updated_at: new Date().toISOString() })
    .eq("id", packet.id)
    .in("followup_state", ["open", "skipped"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return err(409, "Follow-up research already started for this packet.", {
      requestId: rid,
      code: "followup_already_started",
    });
  }
  const reopenPacket = () =>
    admin
      .from("packets")
      .update({ followup_state: "open", updated_at: new Date().toISOString() })
      .eq("id", packet.id)
      .eq("followup_state", "researching");

  const processor = resolveProcessor();
  const { data: inserted, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      piece_id: packet.piece_id,
      kind: "followup_research",
      status: "dispatching",
      idempotency_key: idempotencyKey,
      input: {
        topic,
        goal,
        processor,
        workflow: "research_packet",
        followup: {
          packet_id: packet.id,
          version: (packet.version ?? 1) + 1,
          questions,
          original_packet_body: originalPacketBody,
          base_branch: originalRun?.branch ?? null,
        },
      },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId: existing.piece_id }, 202, rid);
    await reopenPacket();
    return err(500, insertErr?.message ?? "Insert failed", {
      requestId: rid,
      code: "run_insert_failed",
      cause: insertErr,
    });
  }
  const runId = inserted.id as string;
  logEvent(FN, "info", { requestId: rid, event: "run_created", runId, packetId: packet.id });

  // Atomic credit hold (idempotent on runId) BEFORE dispatch.
  const reserved = await reserveCreditsForRun(admin, {
    userId,
    runId,
    amount: creditCost,
    reason: "follow-up research",
  });
  if (!reserved.ok) {
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error:
          reserved.code === "insufficient_credits"
            ? "Not enough credits for follow-up research."
            : "Credit reservation failed; you were not charged.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await reopenPacket();
    if (reserved.code === "insufficient_credits") {
      return err(402, "Not enough credits for follow-up research.", {
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
    pieceId: packet.piece_id,
    title: topic,
    provider: "parallel",
  });

  await dispatchResearchRun({
    admin,
    runId,
    topic,
    processor,
    query: buildFollowupQuery({ topic, questions, originalReport }),
  });

  return json({ runId, pieceId: packet.piece_id }, 202, rid);
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

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
