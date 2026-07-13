// Server functions wrapping the final-artifact Edge Functions
// (contracts: docs/research-workflow/BACKEND-CONTRACTS.md). Each job reserves
// 2 credits server-side, dispatches a cloud-agent run, and lands the binary
// in the private final-artifacts bucket; the client only reads rows and
// signed URLs afterwards.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

/** Each final artifact (DOCX or PPTX) holds 2 credits — mirror of the server COST. */
export const FINAL_ARTIFACT_COST = 2;

export type FinalJobResult = { runId: string; artifactId: string | null; cost: number };

/**
 * Create the final Word document (2 credits). Idempotent on requestId —
 * a retry with the same id returns the existing run instead of double-charging.
 */
export const createFinalDocumentJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pieceId: string; requestId: string }) => data)
  .handler(async ({ data, context }): Promise<FinalJobResult> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "create-final-document-job",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "create-final-document-job"));
    return result as FinalJobResult;
  });
