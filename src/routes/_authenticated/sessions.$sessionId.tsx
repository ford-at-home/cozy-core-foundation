import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSessionDetail, type PricingSource } from "@/lib/costs.functions";
import { CostBadge, formatDuration, formatUsd } from "@/components/CostBadge";
import { StatusPill } from "@/components/StatusPill";
import { runKindLabel } from "@/lib/journey";
import { Skeleton } from "@/components/ui/skeleton";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  head: () => ({
    meta: [{ title: pageTitle("Session detail") }, { name: "robots", content: "noindex" }],
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

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading session">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/sessions"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
        >
          ← Cost
        </Link>
        <h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">
          {data.title || `Session ${sessionId.slice(0, 8)}`}
        </h1>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="font-mono text-3xl tabular-nums">{formatUsd(data.total_cost_usd)}</p>
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

      <section className="space-y-3">
        <h2 className="font-serif text-xl">Runs</h2>

        <ul className="space-y-3 md:hidden">
          {data.runs.map((r) => (
            <li key={r.id}>
              <Link
                to="/runs/$runId"
                params={{ runId: r.id }}
                className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{runKindLabel(r.kind)}</p>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="uppercase tracking-wide">Cost</p>
                    <p className="mt-0.5 font-mono text-sm text-foreground tabular-nums">
                      {formatUsd(r.total_cost_usd)}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide">Duration</p>
                    <p className="mt-0.5 text-sm text-foreground tabular-nums">
                      {formatDuration(r.duration_ms)}
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wide">Inferences</p>
                    <p className="mt-0.5 text-sm text-foreground tabular-nums">
                      {r.inference_count}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
                    {r.provider ?? (r.kind === "research" ? "parallel" : "cursor")}
                  </span>
                  <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time>
                </div>
              </Link>
            </li>
          ))}
          {data.runs.length === 0 && (
            <li className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No runs yet.
            </li>
          )}
        </ul>

        <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Kind
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Provider
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
                    Inferences
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/runs/$runId"
                        params={{ runId: r.id }}
                        className="font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
                      >
                        {runKindLabel(r.kind)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide text-muted-foreground">
                        {r.provider ?? (r.kind === "research" ? "parallel" : "cursor")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatUsd(r.total_cost_usd)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {formatDuration(r.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.inference_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {data.runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
