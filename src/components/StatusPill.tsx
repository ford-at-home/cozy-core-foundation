import type { RunStatus } from "@/lib/workflows.functions";
import { cn } from "@/lib/utils";

/** Dark-theme friendly tones shared by dashboard + run detail. */
const TONE: Record<string, string> = {
  requested: "bg-muted text-muted-foreground",
  dispatching: "bg-muted text-muted-foreground",
  dispatch_unknown: "bg-amber-500/15 text-amber-400",
  queued: "bg-muted text-muted-foreground",
  running: "bg-primary/15 text-primary",
  awaiting_fetch: "bg-primary/15 text-primary",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  cancel_requested: "bg-amber-500/15 text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

// Plain-language labels for the run/session state machines. The raw status
// stays available as the pill's title attribute; unknown statuses fall back
// to a humanized version of the raw value so new states never render blank.
const LABEL: Record<string, string> = {
  requested: "Starting",
  dispatching: "Starting",
  dispatch_unknown: "Confirming start",
  queued: "Queued",
  running: "Working",
  awaiting_fetch: "Finishing up",
  completed: "Done",
  failed: "Didn't finish",
  cancel_requested: "Cancelling",
  cancelled: "Cancelled",
  // sessions.status values
  pending: "Starting",
  active: "Working",
};

export function statusLabel(status: string): string {
  return LABEL[status] ?? status.replace(/_/g, " ");
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      title={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[status] ?? TONE.queued,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

export function StatusBadge({ status }: { status: RunStatus | string }) {
  return <StatusPill status={status} />;
}
