// Edge function: piece-action — UI-driven iterate/annotate actions.
//
//   resynth — new proposal attempt (feedback-steered), branch-only.
//   ready   — final draft from the accepted proposal, autoCreatePr: true
//             (approval moment #1 happens on the PR).
//   revise  — apply typed annotation transcript to the merged draft,
//             autoCreatePr: true (approval moment #2).
//
// Same controller rules as start-workflow: authenticated caller, safe inputs
// only, voice from profile, insert-before-dispatch, idempotent on requestId.
//
// The GitHub issue/label mirror of these actions (peers commenting, labels
// triggering the same runs) rides on a GitHub App the owner installs later;
// this function is the UI-first path and does not depend on it.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildDraftPrompt,
  buildResynthPrompt,
  buildRevisionPrompt,
} from "../_shared/prompt.ts";
import { buildImageCreds } from "../_shared/image-token.ts";
import { dispatchRun, resolveProvider } from "../_shared/dispatch.ts";

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

const ACTIONS = ["resynth", "ready", "revise"] as const;
type Action = (typeof ACTIONS)[number];

const KIND_FOR_ACTION: Record<Action, string> = {
  resynth: "resynth",
  ready: "draft",
  revise: "revision",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const pieceId = typeof body?.pieceId === "string" ? body.pieceId : "";
  const action = ACTIONS.includes(body?.action) ? (body.action as Action) : null;
  const feedback = typeof body?.feedback === "string" ? body.feedback.trim() : "";
  const requestId = typeof body?.requestId === "string" && body.requestId
    ? body.requestId
    : crypto.randomUUID();
  if (!pieceId || !action) return json({ error: "pieceId and a valid action are required" }, 400);
  if (action === "revise" && !feedback) {
    return json({ error: "revise requires the annotation transcript in feedback" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership check (service-role client bypasses RLS, so enforce explicitly).
  const { data: piece } = await admin
    .from("pieces")
    .select("id, user_id, slug, stage")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece || piece.user_id !== userId) return json({ error: "Piece not found" }, 404);

  const idempotencyKey = `${action}:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId }, 202);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("style_text, image_style")
    .eq("user_id", userId)
    .maybeSingle();
  const styleText = (profile?.style_text ?? "").trim();
  const imageStyle = (profile?.image_style ?? "").trim();
  if (!styleText) {
    return json({ error: "Your voice profile is empty. Describe your style at /profile first." }, 422);
  }

  // Base ref: continue from the latest completed run's branch so prior piece
  // files are present. For revise, the draft PR should be merged — fall back
  // to main, where draft.md lives post-merge.
  const { data: lastRun } = await admin
    .from("agent_runs")
    .select("branch, input, kind")
    .eq("piece_id", pieceId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mainRef = Deno.env.get("AGENT_REPO_REF") ?? "main";
  const ref = action === "revise" ? mainRef : (lastRun?.branch ?? mainRef);

  // Pre-check resynth needs the prior input; the prompt itself is built
  // AFTER the run is inserted so the image token can be bound to runId.
  let priorResearch: { research: string; goal: string | null } | null = null;
  if (action === "resynth") {
    const priorInput = (lastRun?.input ?? {}) as { research?: string; goal?: string };
    if (!priorInput.research) {
      return json({ error: "No completed proposal run with research found for this piece" }, 409);
    }
    priorResearch = { research: priorInput.research, goal: priorInput.goal ?? null };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      piece_id: pieceId,
      kind: KIND_FOR_ACTION[action],
      status: "dispatching",
      idempotency_key: idempotencyKey,
      input: {
        action,
        feedback: feedback || null,
        ...(action === "resynth" ? (lastRun?.input ?? {}) : {}),
      },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId }, 202);
    return json({ error: insertErr?.message ?? "Insert failed" }, 500);
  }

  const imageCreds = await buildImageCreds(inserted.id);
  const imageBits = {
    imageStyle,
    imageEndpoint: imageCreds?.endpoint,
    imageToken: imageCreds?.token,
  };
  let prompt: string;
  if (action === "resynth" && priorResearch) {
    prompt = buildResynthPrompt({
      pieceSlug: piece.slug,
      research: priorResearch.research,
      goal: priorResearch.goal,
      styleText,
      feedback: feedback || null,
      ...imageBits,
    });
  } else if (action === "ready") {
    prompt = buildDraftPrompt({
      pieceSlug: piece.slug,
      styleText,
      feedback: feedback || null,
      ...imageBits,
    });
  } else {
    prompt = buildRevisionPrompt({
      pieceSlug: piece.slug,
      draftPath: `pieces/${piece.slug}/draft.md`,
      transcript: feedback,
      styleText,
      ...imageBits,
    });
  }

  await admin
    .from("pieces")
    .update({
      stage: action === "revise" ? "annotating" : "iterating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId);

  await dispatchRun({
    admin,
    provider: resolveProvider(),
    runId: inserted.id,
    prompt,
    ref,
    autoCreatePr: action !== "resynth", // ready + revise end in a PR (approval moments)
  });

  return json({ runId: inserted.id, pieceId }, 202);
});
