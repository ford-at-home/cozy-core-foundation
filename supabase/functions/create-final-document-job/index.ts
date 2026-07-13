// create-final-document-job — reserves 2 credits and creates the agent_runs
// row (kind='final_docx') + a pending final_artifacts row. Contract only:
// actual DOCX rendering is handled by the provider path in a later task.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { creditsEnforced, getBalance, reserveCreditsForRun } from "../_shared/credits.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";
import { dispatchRun, resolveProvider } from "../_shared/dispatch.ts";
import {
  buildFinalDocxPrompt,
  loadPacketBodies,
  loadPriorPacketContext,
} from "../_shared/followup-final.ts";

const FN = "create-final-document-job";
const COST = 2;

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const pieceId = typeof body?.pieceId === "string" ? body.pieceId : "";
    const requestId =
      typeof body?.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
    if (!pieceId) return e(FN, 400, "pieceId required", { requestId: rid, code: "invalid_input" });

    const { data: piece } = await admin
      .from("pieces")
      .select("id, user_id, workflow_stage")
      .eq("id", pieceId)
      .maybeSingle();
    if (!piece || piece.user_id !== userId)
      return e(FN, 404, "Piece not found", { requestId: rid, code: "not_found" });

    const idempotencyKey = `final_docx:${userId}:${requestId}`;
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return j({ runId: existing.id, idempotent: true }, 202, rid);

    if (creditsEnforced()) {
      const bal = await getBalance(admin, userId);
      if (bal < COST)
        return e(FN, 402, "Not enough credits", {
          requestId: rid,
          code: "insufficient_credits",
          details: { balance: bal, required: COST },
        });
    }
    const { data: run, error: runErr } = await admin
      .from("agent_runs")
      .insert({
        user_id: userId,
        piece_id: pieceId,
        kind: "final_docx",
        status: "requested",
        idempotency_key: idempotencyKey,
        input: { pieceId, kind: "final_docx" },
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
      reason: "final DOCX",
    });
    if (!res.ok) {
      await admin.from("agent_runs").update({ status: "failed", error: res.code }).eq("id", run.id);
      return e(FN, 402, "Not enough credits", { requestId: rid, code: res.code });
    }
    const { data: artifact } = await admin
      .from("final_artifacts")
      .insert({
        piece_id: pieceId,
        user_id: userId,
        run_id: run.id,
        kind: "docx",
        status: "pending",
      })
      .select("id")
      .single();

    await advanceStage(admin, { pieceId, to: "final_document_pending" });
    await logPieceEvent(admin, {
      pieceId,
      userId,
      event: "final_docx_started",
      metadata: { runId: run.id, artifactId: artifact?.id },
    });

    // Build context and dispatch to the cloud agent. The agent writes
    // pieces/<slug>/final/document.docx which the reconciler uploads to the
    // private final-artifacts bucket on completion.
    const { data: pieceRow } = await admin
      .from("pieces")
      .select("slug, title")
      .eq("id", pieceId)
      .maybeSingle();
    const { data: profile } = await admin
      .from("profiles")
      .select("style_text, image_style")
      .eq("user_id", userId)
      .maybeSingle();
    const [ctx, bodies] = await Promise.all([
      loadPriorPacketContext(admin, pieceId),
      loadPacketBodies(admin, pieceId),
    ]);
    const prompt = buildFinalDocxPrompt({
      pieceSlug: pieceRow?.slug ?? "piece",
      goal: pieceRow?.title ?? null,
      styleText: (profile?.style_text ?? "").trim(),
      imageStyle: (profile?.image_style ?? "").trim() || undefined,
      packetBody: bodies.packetBody,
      packetAnalysis: ctx.packet?.analysis ?? null,
      verifiedResponses: ctx.verifiedResponses,
      followupSummary: bodies.followupSummary,
      studentContributions: ctx.studentContributions,
    });
    await dispatchRun({
      admin,
      provider: resolveProvider(),
      runId: run.id,
      prompt,
      ref: Deno.env.get("AGENT_REPO_REF") ?? "main",
      autoCreatePr: false,
    });
    return j({ runId: run.id, artifactId: artifact?.id, cost: COST }, 201, rid);
  }),
);
