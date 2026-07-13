// run-follow-up-research — reserves 2 credits, creates an agent_runs row of
// kind 'followup_research', and returns the runId. Downstream fetch-back
// writes a NEW packets row (version = prior+1, supersedes_packet_id = prior).
// Actual provider dispatch reuses the standard dispatch path in a later task;
// for now the run is inserted in state 'requested' so the reconciler can pick
// it up when the provider integration ships. This function does NOT overwrite
// the original packet under any circumstance.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import {
  CREDIT_COST,
  creditsEnforced,
  getBalance,
  reserveCreditsForRun,
} from "../_shared/credits.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";
import { dispatchRun, resolveProvider } from "../_shared/dispatch.ts";
import { buildFollowUpPrompt, loadPriorPacketContext } from "../_shared/followup-final.ts";

const FN = "run-follow-up-research";
const COST = 2;

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const packetId = typeof body?.packetId === "string" ? body.packetId : "";
    const requestId =
      typeof body?.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
    if (!packetId)
      return e(FN, 400, "packetId required", { requestId: rid, code: "invalid_input" });

    const { data: packet } = await admin
      .from("packets")
      .select("id, user_id, piece_id, version")
      .eq("id", packetId)
      .maybeSingle();
    if (!packet || packet.user_id !== userId)
      return e(FN, 404, "Packet not found", { requestId: rid, code: "not_found" });

    // Require at least one approved follow-up question.
    const { count } = await admin
      .from("followup_questions")
      .select("id", { count: "exact", head: true })
      .eq("packet_id", packetId)
      .eq("status", "approved");
    if ((count ?? 0) < 1) {
      return e(FN, 422, "at least one approved follow-up question is required", {
        requestId: rid,
        code: "no_approved_questions",
      });
    }

    const idempotencyKey = `followup:${userId}:${requestId}`;
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return j({ runId: existing.id, idempotent: true }, 202, rid);

    if (creditsEnforced()) {
      const balance = await getBalance(admin, userId);
      if (balance < COST)
        return e(FN, 402, "Not enough credits", {
          requestId: rid,
          code: "insufficient_credits",
          details: { balance, required: COST },
        });
    }

    const { data: run, error: runErr } = await admin
      .from("agent_runs")
      .insert({
        user_id: userId,
        piece_id: packet.piece_id,
        kind: "followup_research",
        status: "requested",
        idempotency_key: idempotencyKey,
        input: { packetId, priorVersion: packet.version, kind: "followup_research" },
      })
      .select("id")
      .single();
    if (runErr)
      return e(FN, 500, "Failed to create run", {
        requestId: rid,
        code: "insert_failed",
        cause: runErr,
      });

    const res = await reserveCreditsForRun(admin, {
      userId,
      runId: run.id,
      amount: COST,
      reason: "follow-up research",
    });
    if (!res.ok) {
      await admin.from("agent_runs").update({ status: "failed", error: res.code }).eq("id", run.id);
      return e(FN, 402, "Not enough credits", { requestId: rid, code: res.code });
    }

    await advanceStage(admin, { pieceId: packet.piece_id, to: "follow_up_research_running" });
    await logPieceEvent(admin, {
      pieceId: packet.piece_id,
      userId,
      event: "followup_started",
      metadata: { runId: run.id },
    });

    // Build the follow-up research prompt from the piece slug, prior packet
    // analysis, the approved questions, and verified student responses, then
    // dispatch to the Cursor cloud-agent provider. `dispatchRun` handles
    // insert-before-dispatch bookkeeping and releases the credit hold on a
    // definitive 4xx rejection.
    const { data: piece } = await admin
      .from("pieces")
      .select("slug")
      .eq("id", packet.piece_id)
      .maybeSingle();
    const ctx = await loadPriorPacketContext(admin, packet.piece_id);
    const prompt = buildFollowUpPrompt({
      pieceSlug: piece?.slug ?? "piece",
      priorVersion: packet.version ?? 1,
      priorPacketAnalysis: ctx.packet?.analysis ?? null,
      approvedQuestions: ctx.approvedQuestions,
      verifiedResponses: ctx.verifiedResponses,
      studentContributions: ctx.studentContributions,
    });
    // Persist the priorPacketId on the run row so the persistor can supersede
    // the correct packet even if a newer version is inserted later.
    await admin
      .from("agent_runs")
      .update({
        input: {
          packetId,
          priorVersion: packet.version ?? 1,
          priorPacketId: packet.id,
          kind: "followup_research",
        },
      })
      .eq("id", run.id);
    await dispatchRun({
      admin,
      provider: resolveProvider(),
      runId: run.id,
      prompt,
      ref: Deno.env.get("AGENT_REPO_REF") ?? "main",
      autoCreatePr: false,
    });
    return j({ runId: run.id, packetId, cost: COST }, 201, rid);
  }),
);
// Referenced imports for tree-shakers.
void CREDIT_COST;
