// Reconciliation for deep-research runs (kind='research', executed by
// Parallel AI). Extracted from reconcile-runs/index.ts so the chain logic —
// the riskiest step — is unit-testable without starting the server.
//
// Lifecycle: dispatching -> queued -> running -> awaiting_fetch (Parallel
// says completed) -> [fetch report, CHAIN a Cursor compose run] -> completed.
// The chain is exactly-once via the compose run's idempotency key, so a
// crash anywhere here is safe to re-sweep.

// deno-lint-ignore-file no-explicit-any
import {
  buildResearchReport,
  getResearchResult,
  getResearchTask,
  mapParallelStatus,
} from "./parallel.ts";
import { canTransition } from "./state.ts";
import { buildComposePrompt } from "./prompt.ts";
import { buildImageCreds } from "./image-token.ts";
import { dispatchRun, resolveProvider } from "./dispatch.ts";
import { ensureRunSession, recordInference } from "./usage.ts";

const RELEASE_AFTER_MIN = 30;
// Deep research (ultra-fast) is documented at 1-10 min; anything past this is stuck.
const RESEARCH_TIMEOUT_MIN = 45;

export async function reconcileResearch(admin: any, run: any): Promise<void> {
  const ageMin = (Date.now() - new Date(run.created_at).getTime()) / 60_000;

  if (!run.external_run_id) {
    if (ageMin > RELEASE_AFTER_MIN) {
      await admin
        .from("agent_runs")
        .update({
          status: "failed",
          error: "Research dispatch was never confirmed. Resubmit the topic.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    return;
  }

  const task = await getResearchTask(run.external_run_id);
  await admin.from("agent_run_events").insert({
    run_id: run.id,
    source: "reconciler",
    event_type: "polled",
    payload: { provider: "parallel", rawStatus: task.rawStatus },
  });

  const mapped = mapParallelStatus(task.rawStatus);
  let status = run.status;
  if (mapped && mapped !== run.status && canTransition(run.status, mapped)) {
    status = mapped;
    await admin
      .from("agent_runs")
      .update({
        status: mapped,
        external_raw_status: task.rawStatus,
        ...(mapped === "failed"
          ? {
            error: `Parallel reported ${task.rawStatus}`,
            completed_at: new Date().toISOString(),
          }
          : {}),
      })
      .eq("id", run.id);
  }

  if (status === "awaiting_fetch") {
    await completeResearchAndChain(admin, run);
    return;
  }

  // Stuck non-terminal past the deadline: fail rather than poll forever.
  if (status !== "failed" && ageMin > RESEARCH_TIMEOUT_MIN) {
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error:
          `Deep research exceeded ${RESEARCH_TIMEOUT_MIN} minutes (last Parallel status: ${task.rawStatus}). Resubmit the topic.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
  }
}

export async function completeResearchAndChain(admin: any, run: any): Promise<void> {
  const topic = typeof run.input?.topic === "string" ? run.input.topic : "";
  const goal = typeof run.input?.goal === "string" ? run.input.goal : null;
  const processor = typeof run.input?.processor === "string" ? run.input.processor : "unknown";

  const raw = await getResearchResult(run.external_run_id);
  const report = buildResearchReport({
    topic,
    processor,
    parallelRunId: run.external_run_id,
    content: raw.content,
    sourceUrls: raw.sourceUrls,
  });

  // Record one fixed-task-price inference for this Parallel run.
  try {
    await recordInference(admin, {
      runId: run.id,
      provider: "parallel",
      model: processor,
      operationType: "extract",
      idempotencyKey: `parallel:${run.external_run_id}:task`,
      externalRequestId: run.external_run_id,
      startedAt: run.dispatched_at ?? run.created_at,
      completedAt: new Date().toISOString(),
      outputTokens: Math.ceil(report.length / 4),
      metadata: {
        processor,
        topic,
        sources: raw.sourceUrls.length,
        reportChars: report.length,
        report_est_tokens: Math.ceil(report.length / 4),
      },
      rawPayload: { processor, sources: raw.sourceUrls.length, reportChars: report.length },
    });
  } catch (err) {
    await admin.from("agent_run_events").insert({
      run_id: run.id,
      source: "usage",
      event_type: "record_error",
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
  }

  // Voice + slug for the chained compose run (server-side, same as submit).
  const { data: profile } = await admin
    .from("profiles")
    .select("style_text, image_style")
    .eq("user_id", run.user_id)
    .maybeSingle();
  const styleText = (profile?.style_text ?? "").trim();
  const imageStyle = (profile?.image_style ?? "").trim();
  const { data: piece } = run.piece_id
    ? await admin.from("pieces").select("slug").eq("id", run.piece_id).maybeSingle()
    : { data: null };

  if (!styleText || !piece?.slug) {
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error: !styleText
          ? "Research completed, but your voice profile is now empty; composing is refused by design. Fill /profile and resubmit."
          : "Research completed, but the piece row is missing.",
        result: researchResultShape(report, null),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return;
  }

  // Exactly-once chain: the idempotency key is derived from THIS research
  // run, so concurrent sweeps or crash-retries converge on one compose run.
  const chainKey = `compose:${run.user_id}:research:${run.id}`;
  let composeRunId: string | null = null;
  let needsDispatch = false;
  const { data: insertedChain, error: chainErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: run.user_id,
      piece_id: run.piece_id,
      kind: "proposal",
      status: "dispatching",
      idempotency_key: chainKey,
      input: { goal, topic, from_research_run: run.id },
    })
    .select("id")
    .single();
  if (insertedChain) {
    composeRunId = insertedChain.id;
    needsDispatch = true;
  } else {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", chainKey)
      .maybeSingle();
    if (!existing) throw new Error(chainErr?.message ?? "Chain insert failed");
    composeRunId = existing.id;
  }

  await admin
    .from("agent_runs")
    .update({
      status: "completed",
      result: researchResultShape(report, composeRunId),
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  await admin.from("agent_run_events").insert({
    run_id: run.id,
    source: "reconciler",
    event_type: "chained",
    payload: { composeRunId, reportChars: report.length, sources: raw.sourceUrls.length },
  });

  if (needsDispatch && composeRunId) {
    // Chained compose run inherits the same session as the research run.
    if (run.session_id) {
      await admin
        .from("agent_runs")
        .update({ session_id: run.session_id, provider: "cursor" })
        .eq("id", composeRunId);
    } else {
      await ensureRunSession(admin, {
        runId: composeRunId,
        userId: run.user_id,
        pieceId: run.piece_id,
        title: goal ?? topic ?? null,
        provider: "cursor",
      });
    }
    const imageCreds = await buildImageCreds(composeRunId);
    await dispatchRun({
      admin,
      provider: resolveProvider(),
      runId: composeRunId,
      prompt: buildComposePrompt({
        pieceSlug: piece.slug,
        research: report,
        goal,
        styleText,
        imageStyle,
        imageEndpoint: imageCreds?.endpoint,
        imageToken: imageCreds?.token,
      }),
      researchChars: report.length,
      ref: Deno.env.get("AGENT_REPO_REF") ?? "main",
      autoCreatePr: false,
    });
  }
}

/** Result jsonb for a research run: renders in the run page's file tabs. */
export function researchResultShape(report: string, nextRunId: string | null) {
  return {
    channels: [
      { channel: "research", files: [{ name: "research.md", content: report }] },
    ],
    ...(nextRunId ? { nextRunId } : {}),
  };
}
