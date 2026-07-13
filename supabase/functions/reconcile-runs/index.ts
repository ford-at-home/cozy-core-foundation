// Edge function: reconcile-runs — the AUTHORITATIVE status path.
//
// Scheduled (pg_cron + pg_net, or invoked manually). Sweeps non-terminal
// runs and reconciles each against the provider:
//   - queued/running: poll GET /v0/agents/{id}; apply status monotonically.
//   - awaiting_fetch: retry the branch fetch until the deliverable lands.
//   - dispatch_unknown: we cannot list-match agents in v0 without correlation
//     metadata, so runs older than RELEASE_AFTER_MIN are failed with a clear
//     message rather than silently retried (no blind re-create — Cursor has
//     no idempotency key; a re-create could double-bill).
//   - cancel_requested: confirm the stop stuck (status no longer RUNNING).
//
// Protected by the platform's function auth (invoked with the service or
// anon key via pg_net); it reads no user input.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CursorProvider } from "../_shared/provider.cursor.ts";
import { StubProvider } from "../_shared/provider.stub.ts";
import type { AgentProvider } from "../_shared/provider.ts";
import { ProviderHttpError } from "../_shared/provider.ts";
import {
  applyExternalStatus,
  fetchRunResult,
  prUrlFieldForKind,
  stageForCompletedKind,
  type RunRow,
} from "../_shared/complete.ts";
import { reconcileResearch } from "../_shared/research.ts";
import { errorResponse, jsonResponse, logEvent, newRequestId } from "../_shared/observability.ts";
import { recordInference, cursorInferenceUsage } from "../_shared/usage.ts";
import { releaseRunCredits, settleRunCredits, sweepStaleReservations } from "../_shared/credits.ts";
import { reconcilePurchases } from "../_shared/stripe-reconcile.ts";
import { persistPacketResult } from "../_shared/packet.ts";
import {
  persistFinalArtifactResult,
  persistFollowUpResult,
  settleFinalArtifactFailure,
} from "../_shared/followup-final.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";
import { workflowStageForCompletedKind, workflowStageForFailedKind } from "../_shared/complete.ts";

const FN = "reconcile-runs";

const RELEASE_AFTER_MIN = 30;

function resolveProvider(): AgentProvider {
  if (Deno.env.get("AGENT_PROVIDER") === "stub") return new StubProvider();
  const key = Deno.env.get("CURSOR_API_KEY")?.trim();
  if (key) return new CursorProvider(key);
  return new StubProvider();
}

Deno.serve(async (req) => {
  const rid = newRequestId();
  if (req.method !== "POST") {
    return errorResponse(FN, 405, "method not allowed", { requestId: rid });
  }

  // Optional shared-secret gate (JWT verification is off so pg_cron can call
  // this without a user token). If RECONCILE_TOKEN is set, require it.
  const gate = Deno.env.get("RECONCILE_TOKEN")?.trim();
  if (gate && req.headers.get("authorization") !== `Bearer ${gate}`) {
    return errorResponse(FN, 401, "unauthorized", { requestId: rid, code: "bad_token" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return errorResponse(FN, 500, "server misconfigured", { requestId: rid, code: "env_missing" });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = resolveProvider();

  const { data: open, error } = await admin
    .from("agent_runs")
    .select(
      "id, user_id, piece_id, status, kind, branch, input, external_agent_id, external_run_id, created_at, dispatched_at, session_id, cancellation_status, parent_run_id",
    )
    .not("status", "in", "(completed,failed,cancelled)")
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) {
    return errorResponse(FN, 500, error.message, {
      requestId: rid,
      code: "query_failed",
      cause: error,
    });
  }

  const summary: Record<string, number> = {};
  const bump = (k: string) => (summary[k] = (summary[k] ?? 0) + 1);

  for (const run of open ?? []) {
    try {
      await reconcileOne(admin, provider, run);
      bump(run.status);
    } catch (err) {
      bump("error");
      logEvent(FN, "error", {
        requestId: rid,
        runId: run.id,
        status: run.status,
        kind: run.kind,
        message: err instanceof Error ? err.message : String(err),
      });
      await admin.from("agent_run_events").insert({
        run_id: run.id,
        source: "reconciler",
        event_type: "reconcile_error",
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // Safety net: resolve credit holds whose runs went terminal without their
  // reservation being settled/released (crash between the two writes).
  let reservationsResolved = 0;
  try {
    reservationsResolved = await sweepStaleReservations(admin);
  } catch (err) {
    logEvent(FN, "error", {
      requestId: rid,
      event: "reservation_sweep_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Stripe-vs-ledger reconciliation: heal paid-but-ungranted purchases and
  // close out expired sessions. No-op until STRIPE_SECRET_KEY is configured.
  let purchases = { healed: 0, expired: 0, flagged: 0 };
  try {
    purchases = await reconcilePurchases(admin);
  } catch (err) {
    logEvent(FN, "error", {
      requestId: rid,
      event: "purchase_reconcile_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  logEvent(FN, "info", {
    requestId: rid,
    event: "swept",
    scanned: open?.length ?? 0,
    summary,
    reservationsResolved,
    purchases,
  });
  return jsonResponse(
    { scanned: open?.length ?? 0, summary, reservationsResolved, purchases },
    200,
    rid,
  );
});

async function reconcileOne(admin: any, provider: AgentProvider, run: any) {
  if (run.kind === "research") return reconcileResearch(admin, run);
  const ageMin = (Date.now() - new Date(run.created_at).getTime()) / 60_000;

  // Never dispatched, or ambiguous dispatch: without vendor-side correlation
  // there is nothing safe to match on. Release stale rows to failed.
  if (!run.external_agent_id) {
    if (
      (run.status === "dispatch_unknown" ||
        run.status === "requested" ||
        run.status === "dispatching") &&
      ageMin > RELEASE_AFTER_MIN
    ) {
      await admin
        .from("agent_runs")
        .update({
          status: "failed",
          error:
            "Dispatch was never confirmed. If a Cursor agent exists for this run, stop it in the Cursor dashboard, then resubmit.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await releaseRunCredits(admin, run, "dispatch never confirmed", "reconciler");
      await settleFinalArtifactFailure(admin, run);
    }
    return;
  }

  let agent;
  try {
    agent = await provider.getAgent(run.external_agent_id);
  } catch (err) {
    if (err instanceof ProviderHttpError && err.status === 404) {
      await admin
        .from("agent_runs")
        .update({
          status: "failed",
          error: "Agent not found at provider (deleted or expired).",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await releaseRunCredits(admin, run, "agent not found at provider", "reconciler");
      await settleFinalArtifactFailure(admin, run);
      return;
    }
    throw err;
  }

  await admin.from("agent_run_events").insert({
    run_id: run.id,
    source: "reconciler",
    event_type: "polled",
    payload: { rawStatus: agent.rawStatus, branch: agent.branch, prUrl: agent.prUrl },
  });

  const branch = agent.branch ?? run.branch;
  const update = applyExternalStatus(run as RunRow, agent.rawStatus);
  const status = update?.status ?? run.status;
  if (update) {
    await admin
      .from("agent_runs")
      .update({
        ...update,
        external_raw_status: agent.rawStatus,
        branch,
        ...(update.status === "failed" ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", run.id);
    if (update.status === "failed") {
      await releaseRunCredits(admin, run, "agent reported failure", "reconciler");
      await settleFinalArtifactFailure(admin, run);
      const failStage = workflowStageForFailedKind(run.kind);
      if (failStage && run.piece_id) {
        await advanceStage(admin, { pieceId: run.piece_id, to: failStage });
      }
    }
  }

  // Cancellation confirm: agent no longer running after a stop request.
  if (
    run.status === "cancel_requested" &&
    !["CREATING", "RUNNING"].includes(agent.rawStatus.toUpperCase())
  ) {
    if (agent.rawStatus.toUpperCase() !== "FINISHED") {
      await admin
        .from("agent_runs")
        .update({
          status: "cancelled",
          cancellation_status: "confirmed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      await releaseRunCredits(admin, run, "run cancelled", "reconciler");
      await settleFinalArtifactFailure(admin, run);
      return;
    }
    // Finished before the stop landed: raced; fall through to fetch.
    await admin.from("agent_runs").update({ cancellation_status: "raced" }).eq("id", run.id);
  }

  if (status === "awaiting_fetch") {
    // Idempotently record cost for the Cursor run (safe re-entry from sweeps).
    try {
      const now = new Date().toISOString();
      const dispatchedAt = (run as any).dispatched_at as string | null;
      const durationMs = dispatchedAt
        ? new Date(now).getTime() - new Date(dispatchedAt).getTime()
        : null;
      const cursorUsage = cursorInferenceUsage(run);
      await recordInference(admin, {
        runId: run.id,
        provider: "cursor",
        operationType: "llm",
        idempotencyKey: `cursor:${run.external_agent_id}:complete`,
        externalRequestId: run.external_agent_id,
        startedAt: dispatchedAt,
        completedAt: now,
        durationMs,
        ...cursorUsage,
        metadata: {
          ...cursorUsage.metadata,
          rawStatus: agent.rawStatus,
          kind: run.kind,
          source: "reconciler",
        },
        rawPayload: { rawStatus: agent.rawStatus, branch: agent.branch, prUrl: agent.prUrl },
      });
    } catch (err) {
      await admin.from("agent_run_events").insert({
        run_id: run.id,
        source: "reconciler",
        event_type: "record_error",
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }

    const { data: piece } = run.piece_id
      ? await admin.from("pieces").select("slug").eq("id", run.piece_id).maybeSingle()
      : { data: null };
    const result = piece?.slug
      ? await fetchRunResult({ ...run, branch } as RunRow, piece.slug)
      : null;
    if (result) {
      // Packet runs: persist packets + packet_questions BEFORE completion
      // (idempotent); a throw keeps the run in awaiting_fetch for re-sweep.
      if (run.kind === "packet") {
        await persistPacketResult(admin, run, result);
      } else if (run.kind === "followup_research") {
        await persistFollowUpResult(admin, run, result);
      } else if (run.kind === "final_docx" || run.kind === "final_pptx") {
        await persistFinalArtifactResult(admin, run, piece?.slug ?? "piece");
      }
      await admin
        .from("agent_runs")
        .update({ status: "completed", result, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      // Success condition met: consume the credit hold exactly once.
      await settleRunCredits(admin, run, "reconciler");
      if (run.piece_id) {
        const prField = prUrlFieldForKind(run.kind);
        await admin
          .from("pieces")
          .update({
            stage: stageForCompletedKind(run.kind),
            ...(prField && agent.prUrl ? { [prField]: agent.prUrl } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.piece_id);
        const nextStage = workflowStageForCompletedKind(run.kind);
        if (nextStage) {
          await advanceStage(admin, { pieceId: run.piece_id, to: nextStage });
          await logPieceEvent(admin, {
            pieceId: run.piece_id,
            userId: run.user_id,
            event: `${run.kind}_completed`,
            metadata: { runId: run.id },
          });
        }
      }
    }
  }
}
