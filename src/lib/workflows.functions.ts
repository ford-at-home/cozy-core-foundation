import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

// Canonical run states — mirror of supabase/functions/_shared/state.ts.
export type RunStatus =
  | "requested"
  | "dispatching"
  | "dispatch_unknown"
  | "queued"
  | "running"
  | "awaiting_fetch"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  "requested",
  "dispatching",
  "dispatch_unknown",
  "queued",
  "running",
  "awaiting_fetch",
  "cancel_requested",
];

export type AgentRun = {
  id: string;
  user_id: string;
  piece_id: string | null;
  status: RunStatus;
  kind: string;
  input: Json | null;
  result: Json | null;
  error: string | null;
  branch: string | null;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
};

const RUN_COLUMNS =
  "id, user_id, piece_id, status, kind, input, result, error, branch, created_at, dispatched_at, completed_at";

export const listMyRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ runs: AgentRun[] }> => {
    const { data, error } = await context.supabase
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as AgentRun[] };
  });

// Safe inputs only. The server resolves everything else (voice from the
// caller's profile; repo/model/prompt server-side). requestId seeds the
// idempotency key so retried submissions cannot double-dispatch.
export type StartWorkflowInput = {
  research?: string;
  /** Deep-research entry point: a topic the backend researches for you. */
  topic?: string;
  goal?: string;
  requestId?: string;
  attachments?: Array<{
    path: string;      // storage path within research-attachments bucket
    name: string;      // display filename
    contentType?: string;
    size?: number;
  }>;
};

export const startWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: StartWorkflowInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ runId: string }> => {
    // Invoke the start-workflow edge function as the signed-in user.
    const { data: result, error } = await context.supabase.functions.invoke(
      "start-workflow",
      { body: data },
    );
    if (error) throw new Error(error.message);
    return result as { runId: string };
  });
