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

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[status] ?? TONE.queued,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {status}
    </span>
  );
}

export function StatusBadge({ status }: { status: RunStatus | string }) {
  return <StatusPill status={status} />;
}
