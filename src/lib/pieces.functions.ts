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
    const { data: result, error } = await context.supabase.functions.invoke(
      "piece-action",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "piece-action"));
    return result as { runId: string; pieceId: string };
  });
