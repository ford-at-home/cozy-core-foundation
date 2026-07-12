// Edge function: cursor-webhook — receiver for Cursor statusChange events.
//
// JWT verification is DISABLED for this function (supabase/config.toml):
// Cursor sends no Supabase JWT. Authentication is the HMAC-SHA256 signature
// over the raw body with CURSOR_WEBHOOK_SECRET.
//
// Rules (docs/cursor-api-research.md): verify before parse; dedup on
// X-Webhook-ID; apply state monotonically (deliveries are at-least-once and
// unordered); ack 2xx fast. The webhook is an optimization — the scheduled
// reconciler is the authority, so any event dropped here is repaired later.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyWebhookSignature } from "../_shared/webhook.ts";
import {
  applyExternalStatus,
  fetchRunResult,
  prUrlFieldForKind,
  stageForCompletedKind,
  type RunRow,
} from "../_shared/complete.ts";
import { recordInference, cursorInferenceUsage } from "../_shared/usage.ts";
import { releaseRunCredits, settleRunCredits } from "../_shared/credits.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("CURSOR_WEBHOOK_SECRET")?.trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response("server misconfigured", { status: 500 });
  }

  // Raw body FIRST — the signature covers these exact bytes.
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const ok = await verifyWebhookSignature(secret, rawBody, req.headers.get("x-webhook-signature"));
  if (!ok) return new Response("invalid signature", { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const externalAgentId = typeof payload?.id === "string" ? payload.id : null;
  const rawStatus = typeof payload?.status === "string" ? payload.status : "";
  if (!externalAgentId) return new Response("missing agent id", { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: run } = await admin
    .from("agent_runs")
    .select(
      "id, user_id, piece_id, status, kind, branch, input, dispatched_at, session_id, parent_run_id",
    )
    .eq("external_agent_id", externalAgentId)
    .maybeSingle();
  // Unknown agent: ack anyway (2xx) — nothing to apply, and retries won't help.
  if (!run) return new Response("unknown agent", { status: 200 });

  // Dedup on X-Webhook-ID via the partial unique index; a replay inserts
  // nothing and changes nothing.
  const eventId = req.headers.get("x-webhook-id");
  const { error: eventErr } = await admin.from("agent_run_events").insert({
    run_id: run.id,
    source: "cursor-webhook",
    external_event_id: eventId,
    event_type: req.headers.get("x-webhook-event") ?? "statusChange",
    payload,
  });
  if (eventErr && eventErr.code === "23505") {
    return new Response("duplicate", { status: 200 });
  }

  const update = applyExternalStatus(run as RunRow, rawStatus);
  if (update) {
    // Persist branch/prUrl refinements the terminal event may carry.
    const branch = payload?.target?.branchName ?? run.branch;
    await admin
      .from("agent_runs")
      .update({
        ...update,
        external_raw_status: rawStatus,
        branch,
        ...(update.status === "failed" ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", run.id);

    if (update.status === "failed") {
      await releaseRunCredits(admin, run, "agent reported failure", "cursor-webhook");
    }

    if (update.status === "awaiting_fetch") {
      // Record one calculated inference for this Cursor agent run.
      try {
        const dispatchedAt = (run as any).dispatched_at as string | null;
        const now = new Date().toISOString();
        const durationMs = dispatchedAt
          ? new Date(now).getTime() - new Date(dispatchedAt).getTime()
          : null;
        const cursorUsage = cursorInferenceUsage(
          run as RunRow & { input?: Record<string, unknown> },
        );
        await recordInference(admin, {
          runId: run.id,
          provider: "cursor",
          operationType: "llm",
          idempotencyKey: `cursor:${externalAgentId}:complete`,
          externalRequestId: externalAgentId,
          startedAt: dispatchedAt,
          completedAt: now,
          durationMs,
          ...cursorUsage,
          metadata: { ...cursorUsage.metadata, rawStatus, source: "webhook" },
          rawPayload: payload,
        });
      } catch (err) {
        await admin.from("agent_run_events").insert({
          run_id: run.id,
          source: "cursor-webhook",
          event_type: "record_error",
          payload: { message: err instanceof Error ? err.message : String(err) },
        });
      }

      // Fetch the deliverable now; on any failure the reconciler retries.
      try {
        const { data: piece } = run.piece_id
          ? await admin.from("pieces").select("slug").eq("id", run.piece_id).maybeSingle()
          : { data: null };
        const slug = piece?.slug;
        const result = slug ? await fetchRunResult({ ...run, branch } as RunRow, slug) : null;
        if (result) {
          await admin
            .from("agent_runs")
            .update({
              status: "completed",
              result,
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);
          // Success condition met: consume the credit hold exactly once.
          await settleRunCredits(admin, run, "cursor-webhook");
          if (run.piece_id) {
            const prField = prUrlFieldForKind(run.kind);
            const prUrl = payload?.target?.prUrl;
            await admin
              .from("pieces")
              .update({
                stage: stageForCompletedKind(run.kind),
                ...(prField && typeof prUrl === "string" ? { [prField]: prUrl } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq("id", run.piece_id);
          }
        }
      } catch (err) {
        await admin.from("agent_run_events").insert({
          run_id: run.id,
          source: "cursor-webhook",
          event_type: "fetch_failed",
          payload: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }

  return new Response("ok", { status: 200 });
});
