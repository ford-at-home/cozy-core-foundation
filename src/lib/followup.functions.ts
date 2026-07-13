// Server functions wrapping the follow-up Edge Functions
// (contracts: docs/research-workflow/BACKEND-CONTRACTS.md). The client is
// SELECT-only on followup_questions — submitting, refining, approving, and
// dispatching all happen server-side after an ownership check.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

/** Follow-up research holds 2 credits (docs/research-workflow/05, BILLING). */
export const FOLLOWUP_RESEARCH_COST = 2;

/**
 * Submit 1..3 follow-up questions and (optionally) get suggested narrower
 * wordings back as followup_questions rows. Free; replaces the packet's
 * current question set.
 */
export const prepareFollowupQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { packetId: string; questions: string[]; suggestRefinements?: boolean }) => data,
  )
  .handler(async ({ data, context }): Promise<{ count: number; hasSuggestions: boolean }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "prepare-follow-up-questions",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "prepare-follow-up-questions"));
    return result as { count: number; hasSuggestions: boolean };
  });

export type FollowupApproval = {
  /** The student's original wording — kept for provenance, never overwritten. */
  studentText: string;
  /** The final wording the student chose (their own, the suggestion, or an edit). */
  approvedText: string;
  /** The suggestion the student saw, if any. */
  suggestedText?: string | null;
};

/**
 * Lock in the final wording: writes status='approved' rows, the gate
 * run-follow-up-research requires. Free.
 */
export const approveFollowupQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packetId: string; questions: FollowupApproval[] }) => data)
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "prepare-follow-up-questions",
      { body: { packetId: data.packetId, approve: true, questions: data.questions } },
    );
    if (error) throw new Error(await extractEdgeError(error, "prepare-follow-up-questions"));
    return result as { count: number };
  });

/**
 * Record skipping (or reopening) the optional follow-up stage. Persisted as
 * an append-only piece event so the choice survives leaving the page; the
 * project hub reads it back via getFollowupSkipped. Free.
 */
export const setFollowupSkip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packetId: string; skip: boolean }) => data)
  .handler(async ({ data, context }): Promise<{ skipped: boolean }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "prepare-follow-up-questions",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "prepare-follow-up-questions"));
    return result as { skipped: boolean };
  });

/**
 * Dispatch the focused second research pass over the approved questions.
 * Reserves 2 credits; idempotent on requestId (a retry returns the same run).
 * The result is a NEW packet version — the original is never modified.
 */
export const runFollowupResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { packetId: string; requestId: string }) => data)
  .handler(async ({ data, context }): Promise<{ runId: string; cost: number }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "run-follow-up-research",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "run-follow-up-research"));
    return result as { runId: string; cost: number };
  });
