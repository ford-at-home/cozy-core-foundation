// Edge function: start-workflow
//
// Contract:
//   - Requires an authenticated user (validates the caller's Supabase JWT).
//   - Body: { research?, voice?, goal?, bundle?, model? }
//   - Inserts a queued workflow_runs row for that user.
//   - If WORKER_URL is set, POSTs { runId, input } to `${WORKER_URL}/compose`
//     with `Authorization: Bearer ${WORKER_TOKEN}`. On failure, marks the run
//     as failed but still returns { runId } with status 200.
//   - If WORKER_URL is not set, just returns { runId } (placeholder mode).
//
// This function must NOT import any AI SDK and must NOT hold any AI provider key.
// The generation itself runs on a separate, self-hosted Node worker.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  // Validate the caller's identity using the anon client + provided JWT.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(
    token,
  );
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = {
    research: typeof body?.research === "string" ? body.research : null,
    voice: typeof body?.voice === "string" ? body.voice : null,
    goal: typeof body?.goal === "string" ? body.goal : null,
    bundle: body?.bundle ?? null,
    model: typeof body?.model === "string" ? body.model : null,
  };

  // Insert with service role so we can also update on worker failure.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: inserted, error: insertErr } = await admin
    .from("workflow_runs")
    .insert({
      user_id: userId,
      status: "queued",
      workflow_type: "compose",
      input,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return json({ error: insertErr?.message ?? "Insert failed" }, 500);
  }
  const runId = inserted.id as string;

  const WORKER_URL = Deno.env.get("WORKER_URL");
  const WORKER_TOKEN = Deno.env.get("WORKER_TOKEN");

  if (WORKER_URL) {
    // TODO: Extend this dispatch (retries, signing, richer payload) when the
    // real worker contract is finalized. Keep JWT verification + RLS-safe insert.
    try {
      const res = await fetch(`${WORKER_URL.replace(/\/$/, "")}/compose`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(WORKER_TOKEN
            ? { Authorization: `Bearer ${WORKER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ runId, input }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        await admin
          .from("workflow_runs")
          .update({
            status: "failed",
            error: `Worker responded ${res.status}: ${text.slice(0, 500)}`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }
    } catch (err) {
      await admin
        .from("workflow_runs")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
  }

  return json({ runId });
});