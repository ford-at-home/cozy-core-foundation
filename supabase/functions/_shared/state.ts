// Canonical run state machine (plan v2 §data model). Pure module: no I/O,
// tested by supabase/functions/_tests/state.test.ts.

export const RUN_STATES = [
  "requested",
  "dispatching",
  "dispatch_unknown",
  "queued",
  "running",
  "awaiting_fetch",
  "completed",
  "failed",
  "cancel_requested",
  "cancelled",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set(["completed", "failed", "cancelled"]);

export function isTerminal(state: RunState): boolean {
  return TERMINAL_STATES.has(state);
}

// Legal transitions. Monotonic guard: anything not listed is rejected, so a
// late/out-of-order webhook can never regress a run (e.g. completed -> running).
const TRANSITIONS: Record<RunState, readonly RunState[]> = {
  requested: ["dispatching", "failed", "cancelled"],
  dispatching: ["queued", "running", "dispatch_unknown", "failed"],
  // Reconciler resolves ambiguity: found the agent -> queued/running/terminal;
  // confirmed it never existed -> requested (safe to re-dispatch).
  dispatch_unknown: ["requested", "queued", "running", "awaiting_fetch", "failed", "cancelled"],
  queued: ["running", "awaiting_fetch", "failed", "cancel_requested"],
  running: ["awaiting_fetch", "failed", "cancel_requested"],
  awaiting_fetch: ["completed", "failed"],
  completed: [],
  failed: [],
  cancel_requested: ["cancelled", "awaiting_fetch", "completed", "failed"],
  cancelled: [],
};

export function canTransition(from: RunState, to: RunState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Cursor v0 documented statuses. The enum is not exhaustively documented;
// unknown values map to a non-terminal hold (null = "no transition"), never
// to a terminal state (forward-compat rule from the API research).
export function mapExternalStatus(raw: string): RunState | null {
  switch (raw.toUpperCase()) {
    case "CREATING":
      return "queued";
    case "RUNNING":
      return "running";
    case "FINISHED":
      return "awaiting_fetch"; // business-done only after content is fetched
    case "ERROR":
      return "failed";
    default:
      return null;
  }
}
