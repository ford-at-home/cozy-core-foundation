// Shared helpers for the research workflow: advance the FSM stage and record
// packet-level events. All writes require service_role.
// deno-lint-ignore-file no-explicit-any
import { logEvent } from "./observability.ts";

export async function advanceStage(
  admin: any,
  args: { pieceId: string; to: string; actor?: string | null },
): Promise<{ ok: true; stage: string } | { ok: false; message: string }> {
  const { data, error } = await admin.rpc("advance_workflow_stage", {
    _piece_id: args.pieceId,
    _to: args.to,
    _actor: args.actor ?? null,
  });
  if (error) {
    logEvent("workflow", "warn", {
      event: "advance_failed",
      pieceId: args.pieceId,
      to: args.to,
      message: error.message,
    });
    return { ok: false, message: error.message };
  }
  return { ok: true, stage: data as string };
}

export async function logPieceEvent(
  admin: any,
  args: {
    pieceId: string;
    userId: string;
    event: string;
    actor?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await admin.from("piece_events").insert({
      piece_id: args.pieceId,
      user_id: args.userId,
      actor: args.actor ?? "system",
      event: args.event,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    logEvent("workflow", "warn", {
      event: "log_piece_event_failed",
      message: (err as Error).message,
    });
  }
}
