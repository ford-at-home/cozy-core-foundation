import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

export type RecognizePageResult = {
  pageImageId: string;
  status: "recognized" | "rejected" | "failed";
  issues: Array<{ code: string; message: string }>;
  blocks: number;
};

export type RecognizeReturnResult = {
  returnId: string;
  status: string;
  pages?: RecognizePageResult[];
};

// Ask the packet-return edge function to read the uploaded pages. Free —
// recognition never consumes user credits; provider costs are recorded
// server-side as inferences.
export const recognizeReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnId: string }) => data)
  .handler(async ({ data, context }): Promise<RecognizeReturnResult> => {
    const { data: result, error } = await context.supabase.functions.invoke("packet-return", {
      body: data,
    });
    if (error) throw new Error(await extractEdgeError(error, "packet-return"));
    return result as RecognizeReturnResult;
  });
