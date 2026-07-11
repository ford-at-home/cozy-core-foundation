// Edge function: start-workflow — thin, fast, IDEMPOTENT dispatch adapter.
//
// Contract (plan v2 §flows):
//   - Requires an authenticated user (Supabase JWT).
//   - Body: { research, goal?, requestId? } — safe inputs only. Repo, ref,
//     model, prompt, and voice are resolved server-side. Never accepted
//     from the browser.
//   - Voice = caller's profiles.style_text. Empty voice -> 422 (the contract
//     refuses to run without a voice; no silent fallback).
//   - Inserts pieces + agent_runs rows (insert BEFORE dispatch), dispatches
//     to the agent provider, returns 202 { runId, pieceId } immediately.
//   - Idempotent on requestId: a retried submission returns the existing run.
//   - Dispatch ambiguity (timeout / crash between create and persist) lands
//     in status 'dispatch_unknown'; the reconciler resolves it. NEVER
//     blind-retry the create — Cursor has no idempotency key.
//
// This function must never hold the run open and must never place any
// Supabase/GitHub secret in the agent environment.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildComposePrompt, slugify } from "../_shared/prompt.ts";
import type { AgentProvider } from "../_shared/provider.ts";
import { ProviderHttpError } from "../_shared/provider.ts";
import { CursorProvider } from "../_shared/provider.cursor.ts";
import { StubProvider } from "../_shared/provider.stub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function resolveProvider(): AgentProvider {
  if (Deno.env.get("AGENT_PROVIDER") === "stub") return new StubProvider();
  const key = Deno.env.get("CURSOR_API_KEY")?.trim();
  if (key) return new CursorProvider(key);
  // No key configured: the stub keeps the pipeline exercisable end-to-end in
  // the UI while clearly marking runs as stubbed (external id bc_stub_...).
  return new StubProvider();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // --- 1. Authenticate the caller -----------------------------------------
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  // --- 2. Validate safe inputs ---------------------------------------------
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const research = typeof body?.research === "string" ? body.research.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  const requestId = typeof body?.requestId === "string" && body.requestId
    ? body.requestId
    : crypto.randomUUID();
  if (!research) return json({ error: "research is required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 3. Idempotency: an existing run for this requestId wins -------------
  const idempotencyKey = `compose:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId: existing.piece_id }, 202);
  }

  // --- 4. Resolve voice from the caller's profile (server-side only) -------
  const { data: profile } = await admin
    .from("profiles")
    .select("style_text")
    .eq("user_id", userId)
    .maybeSingle();
  const styleText = (profile?.style_text ?? "").trim();
  if (!styleText) {
    return json(
      { error: "Your voice profile is empty. Describe your style at /profile first." },
      422,
    );
  }

  // --- 5. Insert piece + run BEFORE dispatching -----------------------------
  const slug = `${slugify(goal || research.slice(0, 60))}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: piece, error: pieceErr } = await admin
    .from("pieces")
    .insert({ user_id: userId, slug, title: goal || null, stage: "research" })
    .select("id")
    .single();
  if (pieceErr || !piece) return json({ error: pieceErr?.message ?? "Insert failed" }, 500);

  const { data: inserted, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      piece_id: piece.id,
      kind: "proposal",
      status: "dispatching",
      idempotency_key: idempotencyKey,
      // style_text deliberately NOT stored here (sensitive profile data).
      input: { research, goal: goal || null },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    // Unique violation = a concurrent retry won the race; return its run.
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId: existing.piece_id }, 202);
    return json({ error: insertErr?.message ?? "Insert failed" }, 500);
  }
  const runId = inserted.id as string;

  // --- 6. Dispatch ----------------------------------------------------------
  const provider = resolveProvider();
  const prompt = buildComposePrompt({ pieceSlug: slug, research, goal: goal || null, styleText });
  const repository = Deno.env.get("AGENT_REPO_URL") ??
    "https://github.com/ford-at-home/cozy-core-foundation";
  const ref = Deno.env.get("AGENT_REPO_REF") ?? "main";
  const webhookUrl = `${SUPABASE_URL}/functions/v1/cursor-webhook`;
  const webhookSecret = Deno.env.get("CURSOR_WEBHOOK_SECRET")?.trim();

  async function logEvent(eventType: string, payload: unknown) {
    await admin.from("agent_run_events").insert({
      run_id: runId,
      source: "edge",
      event_type: eventType,
      payload,
    });
  }

  try {
    const agent = await provider.createAgent({
      prompt,
      repository,
      ref,
      autoCreatePr: false, // proposal runs push a branch only; PRs come later via "ready"
      model: Deno.env.get("AGENT_MODEL") ?? undefined,
      webhookUrl: webhookSecret ? webhookUrl : undefined,
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
      // Timeout / network / 5xx after send: Cursor MAY have created the agent.
      // Ambiguity state; the reconciler matches or releases it. No retry here.
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

  return json({ runId, pieceId: piece.id }, 202);
});
