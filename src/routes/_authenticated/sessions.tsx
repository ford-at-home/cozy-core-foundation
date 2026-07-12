import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listSessions, type SessionRow } from "@/lib/costs.functions";
import { formatDuration, formatUsd } from "@/components/CostBadge";

export const Route = createFileRoute("/_authenticated/sessions")({
  head: () => ({
    meta: [
      { title: "Cost — Sessions" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionsPage,
});

type Sort = "cost" | "newest" | "duration" | "runs";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Cost accounting
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">Sessions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Total across shown sessions: <strong>{formatUsd(total)}</strong>
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {(["newest", "cost", "duration", "runs"] as Sort[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={
                "rounded px-2.5 py-1 " +
                (sort === k
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground")
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {!isLoading && sessions.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
          No sessions yet. Start a piece from the dashboard.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Cost</th>
              <th className="px-4 py-2 text-right">Duration</th>
              <th className="px-4 py-2 text-right">Runs</th>
              <th className="px-4 py-2 text-left">Providers</th>
              <th className="px-4 py-2 text-left">Started</th>
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
  );
}

function SessionRowView({ s }: { s: SessionRow }) {
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/20">
      <td className="px-4 py-2">
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: s.id }}
          className="font-medium hover:underline"
        >
          {s.title || `Session ${s.id.slice(0, 8)}`}
        </Link>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">{s.status}</td>
      <td className="px-4 py-2 text-right font-mono">{formatUsd(s.total_cost_usd)}</td>
      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
        {formatDuration(s.total_duration_ms)}
      </td>
      <td className="px-4 py-2 text-right">{s.run_count}</td>
      <td className="px-4 py-2">
        <div className="flex gap-1">
          {s.providers.map((p) => (
            <span
              key={p}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            >
              {p}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {new Date(s.started_at).toLocaleString()}
      </td>
    </tr>
  );
}