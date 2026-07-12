import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listSessions, type SessionRow } from "@/lib/costs.functions";
import { formatDuration, formatUsd } from "@/components/CostBadge";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({
    meta: [{ title: pageTitle("Cost") }, { name: "robots", content: "noindex" }],
  }),
  component: SessionsPage,
});

type Sort = "cost" | "newest" | "duration" | "runs";

const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest",
  cost: "Cost",
  duration: "Duration",
  runs: "Runs",
};

function SessionsPage() {
  const fetchFn = useServerFn(listSessions);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sessions", "list"],
    queryFn: () => fetchFn(),
  });
  const [sort, setSort] = useState<Sort>("newest");

  const sessions = useMemo(() => {
    const list = [...(data?.sessions ?? [])];
    switch (sort) {
      case "cost":
        return list.sort((a, b) => Number(b.total_cost_usd) - Number(a.total_cost_usd));
      case "duration":
        return list.sort((a, b) => b.total_duration_ms - a.total_duration_ms);
      case "runs":
        return list.sort((a, b) => b.run_count - a.run_count);
      default:
        return list.sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        );
    }
  }, [data, sort]);

  const total = sessions.reduce((s, x) => s + Number(x.total_cost_usd), 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-5xl">Cost</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Total across shown sessions:{" "}
            <span className="font-mono font-medium text-foreground">{formatUsd(total)}</span>
          </p>
        </div>
        <div
          className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap"
          role="group"
          aria-label="Sort sessions"
        >
          {(["newest", "cost", "duration", "runs"] as Sort[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className={
                "inline-flex min-h-11 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-8 " +
                (sort === k
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground")
              }
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading sessions">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && sessions.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center sm:p-10">
          <p className="font-serif text-xl">No sessions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a piece from the dashboard — cost tracking appears here.
          </p>
          <Link
            to="/new"
            className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create a piece
          </Link>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <>
          <ul className="space-y-3 md:hidden">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">
                      {s.title || `Session ${s.id.slice(0, 8)}`}
                    </p>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="uppercase tracking-wide">Cost</p>
                      <p className="mt-0.5 font-mono text-sm text-foreground tabular-nums">
                        {formatUsd(s.total_cost_usd)}
                      </p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide">Duration</p>
                      <p className="mt-0.5 text-sm text-foreground tabular-nums">
                        {formatDuration(s.total_duration_ms)}
                      </p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wide">Runs</p>
                      <p className="mt-0.5 text-sm text-foreground tabular-nums">{s.run_count}</p>
                    </div>
                  </div>
                  {(s.providers.length > 0 || s.started_at) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {s.providers.map((p) => (
                        <span
                          key={p}
                          className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide"
                        >
                          {p}
                        </span>
                      ))}
                      <time dateTime={s.started_at} className="ml-auto">
                        {new Date(s.started_at).toLocaleString()}
                      </time>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Title
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Cost
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Duration
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Runs
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Providers
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <SessionRowView key={s.id} s={s} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SessionRowView({ s }: { s: SessionRow }) {
  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/20">
      <td className="px-4 py-3">
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: s.id }}
          className="rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {s.title || `Session ${s.id.slice(0, 8)}`}
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusPill status={s.status} />
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatUsd(s.total_cost_usd)}</td>
      <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
        {formatDuration(s.total_duration_ms)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{s.run_count}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {s.providers.map((p) => (
            <span
              key={p}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(s.started_at).toLocaleString()}
      </td>
    </tr>
  );
}
