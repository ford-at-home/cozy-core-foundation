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
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  logEvent,
  newRequestId,
  redactForLog,
} from "../_shared/observability.ts";

const FN = "piece-action";
const json = (body: unknown, status = 200, rid?: string) => jsonResponse(body, status, rid);
const err = (
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
) => errorResponse(FN, status, message, opts);

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
  const rid = newRequestId();
  if (req.method !== "POST") return err(405, "Method not allowed", { requestId: rid });
  try {
    return await handle(req, rid);
  } catch (e) {
    return err(500, "Unhandled server error", { requestId: rid, code: "unhandled", cause: e });
  }
});

async function handle(req: Request, rid: string): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return err(500, "Server misconfigured", { requestId: rid, code: "env_missing" });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return err(401, "Unauthorized", { requestId: rid, code: "no_token" });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return err(401, "Unauthorized", { requestId: rid, code: "invalid_token", cause: userErr });
  }
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
  logEvent(FN, "info", {
    requestId: rid,
    userId,
    pieceId,
    action,
    feedbackChars: feedback.length,
    clientRequestId: requestId,
  });
  if (!pieceId || !action) {
    return err(400, "pieceId and a valid action are required", {
      requestId: rid,
      code: "invalid_input",
      details: { pieceId: pieceId ? "present" : "missing", action: body?.action ?? null },
    });
  }
  if (action === "revise" && !feedback) {
    return err(400, "revise requires the annotation transcript in feedback", {
      requestId: rid,
      code: "missing_feedback",
    });
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
  if (!piece || piece.user_id !== userId) {
    return err(404, "Piece not found", { requestId: rid, code: "piece_not_found" });
  }

  const idempotencyKey = `${action}:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      logEvent(FN, "info", { requestId: rid, event: "idempotent_hit", runId: existing.id });
      return json({ runId: existing.id, pieceId }, 202, rid);
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("style_text, image_style")
    .eq("user_id", userId)
    .maybeSingle();
  const styleText = (profile?.style_text ?? "").trim();
  const imageStyle = (profile?.image_style ?? "").trim();
  if (!styleText) {
    return err(422, "Your voice profile is empty. Describe your style at /profile first.", {
      requestId: rid,
      code: "empty_voice",
    });
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
      return err(409, "No completed proposal run with research found for this piece", {
        requestId: rid,
        code: "no_prior_research",
      });
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
    if (existing) return json({ runId: existing.id, pieceId }, 202, rid);
    return err(500, insertErr?.message ?? "Insert failed", {
      requestId: rid,
      code: "run_insert_failed",
      cause: insertErr,
    });
  }
  logEvent(FN, "info", { requestId: rid, event: "run_created", runId: inserted.id, pieceId, action });

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

  return json({ runId: inserted.id, pieceId }, 202, rid);
}
