import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSessionDetail, type PricingSource } from "@/lib/costs.functions";
import { CostBadge, formatDuration, formatUsd } from "@/components/CostBadge";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  head: () => ({
    meta: [
      { title: "Session detail — Cost" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  const fetchFn = useServerFn(getSessionDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => fetchFn({ data: { sessionId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Session not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/sessions" className="text-xs text-muted-foreground hover:underline">
          ← Sessions
        </Link>
        <h1 className="mt-1 font-serif text-3xl">
          {data.title || `Session ${sessionId.slice(0, 8)}`}
        </h1>
        <div className="mt-2 flex flex-wrap items-baseline gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="font-mono text-3xl">{formatUsd(data.total_cost_usd)}</p>
          </div>
          <Stat label="Status" value={data.status} />
          <Stat label="Duration" value={formatDuration(data.total_duration_ms)} />
          <Stat label="Runs" value={String(data.run_count)} />
          <Stat label="Inferences" value={String(data.inference_count)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Breakdown title="By provider" entries={Object.entries(data.byProvider)} />
        <Breakdown title="By model" entries={Object.entries(data.byModel)} />
        <BreakdownSource entries={Object.entries(data.byPricingSource)} />
      </div>

      <section className="space-y-2">
        <h2 className="font-serif text-lg">Runs</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Kind</th>
                <th className="px-4 py-2 text-left">Provider</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Duration</th>
                <th className="px-4 py-2 text-right">Inferences</th>
                <th className="px-4 py-2 text-left">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <Link
                      to="/runs/$runId"
                      params={{ runId: r.id }}
                      className="font-medium hover:underline"
                    >
                      {r.kind}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
                      {r.provider ?? (r.kind === "research" ? "parallel" : "cursor")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.status}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatUsd(r.total_cost_usd)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                    {formatDuration(r.duration_ms)}
                  </td>
                  <td className="px-4 py-2 text-right">{r.inference_count}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data.runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

function Breakdown({ title, entries }: { title: string; entries: [string, number][] }) {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">No data yet.</p>}
      <ul className="space-y-1">
        {sorted.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{k}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatUsd(v)} · {Math.round((v / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BreakdownSource({ entries }: { entries: [string, number][] }) {
  const filtered = entries.filter(([, v]) => v > 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        By pricing source
      </p>
      {filtered.length === 0 && <p className="text-xs text-muted-foreground">No data yet.</p>}
      <ul className="space-y-1">
        {filtered.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-2 text-sm">
            <CostBadge source={k as PricingSource} />
            <span className="font-mono text-xs text-muted-foreground">{formatUsd(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}