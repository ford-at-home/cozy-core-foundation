// Shared dispatch step: run row already exists (insert-before-dispatch),
// create the external agent, persist the outcome. Encodes the one rule that
// must never be broken: an ambiguous create is dispatch_unknown, not a retry.

// deno-lint-ignore-file no-explicit-any
import type { AgentProvider } from "./provider.ts";
import { ProviderHttpError } from "./provider.ts";
import { CursorProvider } from "./provider.cursor.ts";
import { StubProvider } from "./provider.stub.ts";
import { createResearchTask } from "./parallel.ts";

export function resolveProvider(): AgentProvider {
  if (Deno.env.get("AGENT_PROVIDER") === "stub") return new StubProvider();
  const key = Deno.env.get("CURSOR_API_KEY")?.trim();
  if (key) return new CursorProvider(key);
  // No key configured: the stub keeps the pipeline exercisable end-to-end in
  // the UI while clearly marking runs as stubbed (external id bc_stub_...).
  return new StubProvider();
}

export interface DispatchArgs {
  admin: any; // service-role supabase client
  provider: AgentProvider;
  runId: string;
  prompt: string;
  /** Base ref the agent starts from (main, or a prior run's branch). */
  ref: string;
  autoCreatePr: boolean;
}

export async function dispatchRun(args: DispatchArgs): Promise<void> {
  const { admin, provider, runId } = args;
  const repository = Deno.env.get("AGENT_REPO_URL") ??
    "https://github.com/ford-at-home/cozy-core-foundation";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const webhookSecret = Deno.env.get("CURSOR_WEBHOOK_SECRET")?.trim();

  const logEvent = (eventType: string, payload: unknown) =>
    admin.from("agent_run_events").insert({
      run_id: runId,
      source: "edge",
      event_type: eventType,
      payload,
    });

  try {
    const agent = await provider.createAgent({
      prompt: args.prompt,
      repository,
      ref: args.ref,
      autoCreatePr: args.autoCreatePr,
      model: Deno.env.get("AGENT_MODEL") ?? undefined,
      webhookUrl: webhookSecret ? `${SUPABASE_URL}/functions/v1/cursor-webhook` : undefined,
      webhookSecret: webhookSecret || undefined,
    });
    await admin
      .from("agent_runs")
      .update({
        status: "queued",
        external_agent_id: agent.externalAgentId,
        external_raw_status: agent.rawStatus,
        branch: agent.branch,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await logEvent("dispatched", {
      provider: provider.name,
      externalAgentId: agent.externalAgentId,
      rawStatus: agent.rawStatus,
    });
  } catch (err) {
    if (err instanceof ProviderHttpError && !err.retryable) {
      // Definitive vendor rejection (4xx): the agent was not created.
      await admin
        .from("agent_runs")
        .update({ status: "failed", error: err.message, completed_at: new Date().toISOString() })
        .eq("id", runId);
      await logEvent("dispatch_rejected", { status: err.status, message: err.message });
    } else {
      // Timeout / network / 5xx after send: the vendor MAY have created the
      // agent. Ambiguity state; the reconciler resolves it. No retry here.
      await admin
        .from("agent_runs")
        .update({
          status: "dispatch_unknown",
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", runId);
      await logEvent("dispatch_unknown", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Dispatch a deep-research run to Parallel AI. Same insert-before-dispatch
 * discipline as dispatchRun: the row exists, an ambiguous create lands in
 * dispatch_unknown, and a definitive 4xx fails the run. The reconciler polls
 * Parallel to completion and chains the compose run.
 */
export async function dispatchResearchRun(args: {
  admin: any;
  runId: string;
  topic: string;
  processor: string;
}): Promise<void> {
  const { admin, runId } = args;
  const logEvent = (eventType: string, payload: unknown) =>
    admin.from("agent_run_events").insert({
      run_id: runId,
      source: "edge",
      event_type: eventType,
      payload,
    });

  try {
    const task = await createResearchTask(args.topic, args.processor);
    await admin
      .from("agent_runs")
      .update({
        status: "queued",
        external_run_id: task.runId,
        external_raw_status: task.rawStatus,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await logEvent("dispatched", {
      provider: "parallel",
      externalRunId: task.runId,
      rawStatus: task.rawStatus,
      processor: args.processor,
    });
  } catch (err) {
    if (err instanceof ProviderHttpError && !err.retryable) {
      await admin
        .from("agent_runs")
        .update({ status: "failed", error: err.message, completed_at: new Date().toISOString() })
        .eq("id", runId);
      await logEvent("dispatch_rejected", { status: err.status, message: err.message });
    } else {
      await admin
        .from("agent_runs")
        .update({
          status: "dispatch_unknown",
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", runId);
      await logEvent("dispatch_unknown", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
