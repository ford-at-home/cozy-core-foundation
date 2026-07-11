import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type WorkflowRun = {
  id: string;
  user_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  workflow_type: string;
  input: Json | null;
  result: Json | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export const listMyRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workflow_runs")
      .select(
        "id, user_id, status, workflow_type, input, result, error, created_at, started_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as WorkflowRun[] };
  });

export type StartWorkflowInput = {
  research?: string;
  voice?: string;
  goal?: string;
  bundle?: unknown;
  model?: string;
};

export const startWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: StartWorkflowInput) => data ?? {})
  .handler(async ({ data, context }) => {
    // Invoke the start-workflow edge function as the signed-in user.
    const { data: result, error } = await context.supabase.functions.invoke(
      "start-workflow",
      { body: data },
    );
    if (error) throw new Error(error.message);
    return result as { runId: string };
  });