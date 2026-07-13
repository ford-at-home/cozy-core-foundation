// Server functions wrapping the return/recognition/verification Edge
// Functions (contracts: docs/research-workflow/BACKEND-CONTRACTS.md).
// The client holds SELECT-only grants on the return tables — every write
// below happens server-side after an ownership check.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

export type ReturnUpload = {
  pageNumber: number;
  storagePath: string;
  signedUrl: string;
  token: string;
};

/**
 * Create a packet_returns row plus one page_images row and signed upload URL
 * per staged photo (≤20). The caller uploads each file with
 * `supabase.storage.from("packet-returns").uploadToSignedUrl(...)` and then
 * requests recognition per page.
 */
export const createReturnUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      packetId: string;
      /** Append pages to an existing return (the retake loop) instead of creating a new one. */
      returnId?: string | null;
      pages: Array<{ pageNumber?: number; contentType?: string }>;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<{ returnId: string; uploads: ReturnUpload[] }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "create-student-return-upload",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "create-student-return-upload"));
    return result as { returnId: string; uploads: ReturnUpload[] };
  });

/** Run handwriting recognition on one uploaded page. Free; idempotent. */
export const analyzeReturnedPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pageImageId: string }) => data)
  .handler(async ({ data, context }): Promise<{ pageImageId: string; blocksInserted: number }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "analyze-returned-page",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "analyze-returned-page"));
    return result as { pageImageId: string; blocksInserted: number };
  });

/** Persist one reviewed dictation transcript for a packet. */
export const submitDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      packetId: string;
      transcript: string;
      returnId?: string | null;
      resolvedTarget?: Record<string, unknown>;
      segmentOrder?: number;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<{ segmentId: string }> => {
    const { data: result, error } = await context.supabase.functions.invoke("submit-dictation", {
      body: data,
    });
    if (error) throw new Error(await extractEdgeError(error, "submit-dictation"));
    return result as { segmentId: string };
  });

export type CorrectionInput = {
  blockId?: string;
  segmentId?: string;
  correctedText: string;
  correctedMeaning?: Record<string, unknown>;
};

/**
 * Store the student-approved final text for every reviewed block/segment.
 * Confirmations are corrections whose text equals the recognized text — the
 * presence of a correction row is what marks a target as verified.
 */
export const verifyStudentResponses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pieceId: string; corrections: CorrectionInput[] }) => data)
  .handler(async ({ data, context }): Promise<{ inserted: number }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "verify-student-responses",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "verify-student-responses"));
    return result as { inserted: number };
  });
