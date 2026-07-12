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

const RELEASE_AFTER_MIN = 30;

function resolveProvider(): AgentProvider {
  if (Deno.env.get("AGENT_PROVIDER") === "stub") return new StubProvider();
  const key = Deno.env.get("CURSOR_API_KEY")?.trim();
  if (key) return new CursorProvider(key);
  return new StubProvider();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // Optional shared-secret gate (JWT verification is off so pg_cron can call
  // this without a user token). If RECONCILE_TOKEN is set, require it.
  const gate = Deno.env.get("RECONCILE_TOKEN")?.trim();
  if (gate && req.headers.get("authorization") !== `Bearer ${gate}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response("server misconfigured", { status: 500 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = resolveProvider();

  const { data: open, error } = await admin
    .from("agent_runs")
    .select(
      "id, user_id, piece_id, status, kind, branch, input, external_agent_id, external_run_id, created_at, cancellation_status",
    )
    .not("status", "in", "(completed,failed,cancelled)")
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) return new Response(error.message, { status: 500 });

  const summary: Record<string, number> = {};
  const bump = (k: string) => (summary[k] = (summary[k] ?? 0) + 1);

  for (const run of open ?? []) {
    try {
      await reconcileOne(admin, provider, run);
      bump(run.status);
    } catch (err) {
      bump("error");
      await admin.from("agent_run_events").insert({
        run_id: run.id,
        source: "reconciler",
        event_type: "reconcile_error",
        payload: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return new Response(JSON.stringify({ scanned: open?.length ?? 0, summary }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

async function reconcileOne(admin: any, provider: AgentProvider, run: any) {
  if (run.kind === "research") return reconcileResearch(admin, run);
  const ageMin = (Date.now() - new Date(run.created_at).getTime()) / 60_000;

  // Never dispatched, or ambiguous dispatch: without vendor-side correlation
  // there is nothing safe to match on. Release stale rows to failed.
  if (!run.external_agent_id) {
    if (
      (run.status === "dispatch_unknown" || run.status === "requested" ||
        run.status === "dispatching") && ageMin > RELEASE_AFTER_MIN
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
  let status = update?.status ?? run.status;
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
  }

  // Cancellation confirm: agent no longer running after a stop request.
  if (run.status === "cancel_requested" && !["CREATING", "RUNNING"].includes(agent.rawStatus.toUpperCase())) {
    if (agent.rawStatus.toUpperCase() !== "FINISHED") {
      await admin
        .from("agent_runs")
        .update({
          status: "cancelled",
          cancellation_status: "confirmed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return;
    }
    // Finished before the stop landed: raced; fall through to fetch.
    await admin.from("agent_runs").update({ cancellation_status: "raced" }).eq("id", run.id);
  }

  if (status === "awaiting_fetch") {
    const { data: piece } = run.piece_id
      ? await admin.from("pieces").select("slug").eq("id", run.piece_id).maybeSingle()
      : { data: null };
    const result = piece?.slug
      ? await fetchRunResult({ ...run, branch } as RunRow, piece.slug)
      : null;
    if (result) {
      await admin
        .from("agent_runs")
        .update({ status: "completed", result, completed_at: new Date().toISOString() })
        .eq("id", run.id);
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
      }
    }
  }
}
