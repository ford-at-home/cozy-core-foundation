import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";
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
  session_id: string | null;
  provider: string | null;
  total_cost_usd: string | number;
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
  "id, user_id, piece_id, session_id, provider, total_cost_usd, status, kind, input, result, error, branch, created_at, dispatched_at, completed_at";

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
  /** Which pipeline this run feeds: a long-form draft (default) or a
   *  college research packet (docs/research-workflow/). */
  workflow?: "longform" | "research_packet";
  requestId?: string;
  attachments?: Array<{
    path: string; // storage path within research-attachments bucket
    name: string; // display filename
    contentType?: string;
    size?: number;
  }>;
};

export const startWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: StartWorkflowInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ runId: string; pieceId: string | null }> => {
    // Invoke the start-workflow edge function as the signed-in user.
    const { data: result, error } = await context.supabase.functions.invoke("start-workflow", {
      body: data,
    });
    if (error) throw new Error(await extractEdgeError(error, "start-workflow"));
    const r = result as { runId: string; pieceId?: string | null };
    return { runId: r.runId, pieceId: r.pieceId ?? null };
  });

/** True when a dashboard run row belongs to the research-packet workflow. */
export function isPacketWorkflowRun(run: Pick<AgentRun, "kind" | "input">): boolean {
  if (["packet", "followup_research", "docx", "pptx"].includes(run.kind)) return true;
  const input = run.input as { workflow?: string } | null;
  return input?.workflow === "research_packet";
}
