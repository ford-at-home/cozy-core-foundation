import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

export type PieceAction = "resynth" | "ready" | "revise";

export type PieceActionInput = {
  pieceId?: string;
  action?: PieceAction;
  /** resynth: optional steering feedback. revise: the annotation transcript (required). */
  feedback?: string;
  requestId?: string;
};

export const runPieceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PieceActionInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ runId: string; pieceId: string }> => {
    const { data: result, error } = await context.supabase.functions.invoke("piece-action", {
      body: data,
    });
    if (error) throw new Error(await extractEdgeError(error, "piece-action"));
    return result as { runId: string; pieceId: string };
  });

export type ApproveRevisionResult = {
  ok: true;
  alreadyMerged?: boolean;
  prUrl: string | null;
  prNumber?: number;
  mergedAt?: string;
};

/** Approve & squash-merge the revision run's GitHub PR from inside the app. */
export const approveRevisionPr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<ApproveRevisionResult> => {
    const { data: result, error } = await context.supabase.functions.invoke("approve-revision", {
      body: data,
    });
    if (error) throw new Error(await extractEdgeError(error, "approve-revision"));
    return result as ApproveRevisionResult;
  });

/**
 * Read-only status check: asks GitHub whether the revision PR has been
 * merged (e.g. by the user approving directly on github.com) and stamps
 * `pieces.final_pr_merged_at` if so. Never issues a merge. Idempotent.
 */
export const checkRevisionPrStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data, context }): Promise<ApproveRevisionResult> => {
    const { data: result, error } = await context.supabase.functions.invoke("approve-revision", {
      body: { ...data, mode: "status" },
    });
    if (error) throw new Error(await extractEdgeError(error, "approve-revision"));
    return result as ApproveRevisionResult;
  });
