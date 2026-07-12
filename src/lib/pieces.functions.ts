import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function extractEdgeError(error: unknown, fn: string): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.text !== "function") return fallback;
  try {
    const raw = await ctx.text();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as { error?: string; code?: string; requestId?: string };
      if (parsed?.error) {
        const bits = [parsed.error];
        if (parsed.code) bits.push(`[${parsed.code}]`);
        if (parsed.requestId) bits.push(`(req ${parsed.requestId})`);
        return bits.join(" ");
      }
    } catch {
      // not JSON
    }
    return `${fn}: ${raw.slice(0, 300)}`;
  } catch {
    return fallback;
  }
}
