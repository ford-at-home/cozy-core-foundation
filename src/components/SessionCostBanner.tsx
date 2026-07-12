import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatUsd } from "@/components/CostBadge";
import { getSessionBudget, type SessionBudget } from "@/lib/costs.functions";

export function SessionCostBanner({ sessionId }: { sessionId: string }) {
  const fetchFn = useServerFn(getSessionBudget);
  const { data, isLoading, error } = useQuery({
    queryKey: ["session-budget", sessionId],
    queryFn: () => fetchFn({ data: { sessionId } }),
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        Loading piece cost…
      </div>
    );
  }
  if (error || !data) return null;

  return <SessionCostBannerInner budget={data} sessionId={sessionId} />;
}

function SessionCostBannerInner({
  budget,
  sessionId,
}: {
  budget: SessionBudget;
  sessionId: string;
}) {
  const over = budget.overBudget;
  const pct = budget.pctOfTarget;

  return (
    <div
      className={
        "rounded-xl border px-4 py-3 " +
        (over
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-border bg-card")
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Piece cost
          </p>
          <p className="mt-0.5 font-mono text-2xl">{formatUsd(budget.totalCostUsd)}</p>
          {budget.targetUsd > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Planning target ({budget.targetUnit}): {formatUsd(budget.targetUsd)}
              {pct !== null && (
                <> · {Math.round(pct * 100)}% of target</>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {budget.targetUsd > 0 && (
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
                (over
                  ? "bg-amber-500/20 text-amber-700"
                  : "bg-emerald-500/15 text-emerald-600")
              }
            >
              {over ? "Over budget" : "Within budget"}
            </span>
          )}
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Session breakdown →
          </Link>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {budget.runCount} run{budget.runCount === 1 ? "" : "s"} · tracked at app boundaries;
        calibrate placeholders from invoices (see docs/COST-CALIBRATION.md).
      </p>
    </div>
  );
}
