import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMyRuns } from "@/lib/workflows.functions";
import { formatUsd } from "@/components/CostBadge";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Compose" },
      { name: "description", content: "Your recent workflow runs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchRuns = useServerFn(listMyRuns);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent_runs", "recent"],
    queryFn: () => fetchRuns(),
  });

  return (

    <div className="space-y-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your 20 most recent workflow runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.navigate({ to: "/new" })}
          className="shrink-0 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + New piece
        </button>
      </div>

      {/* INSERT: dashboard UI from migrated app goes here. Keep using listMyRuns. */}

      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        {isLoading && (
          <div className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
            <Spinner />
            Loading your workflow runs…
          </div>
        )}
        {error && (
          <div className="flex flex-col gap-3 p-8">
            <div className="flex items-start gap-3 text-sm text-destructive">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <path d="M12 9v4"/><path d="M12 17h.01"/>
              </svg>
              <div>
                <p className="font-medium">Could not load your runs</p>
                <p className="text-destructive/80">{error.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["agent_runs", "recent"] })}
              className="self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && (data?.runs.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-background text-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-serif text-xl">No runs yet</p>
              <p className="text-sm text-muted-foreground">Start one from the New piece page.</p>
            </div>
            <button
              type="button"
              onClick={() => router.navigate({ to: "/new" })}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create your first piece
            </button>
          </div>
        )}
        {!isLoading && !error && (data?.runs.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Run cost</th>
                <th className="px-5 py-3 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {data!.runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.navigate({ to: "/runs/$runId", params: { runId: r.id } })}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-5 py-3.5">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{r.kind}</td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-xs">
                    {formatUsd(r.total_cost_usd)}
                    {r.session_id && (
                      <>
                        {" "}
                        <Link
                          to="/sessions/$sessionId"
                          params={{ sessionId: r.session_id }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:underline"
                          title="View piece session cost"
                        >
                          session
                        </Link>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                    {r.id.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    requested: "bg-muted text-muted-foreground",
    dispatching: "bg-muted text-muted-foreground",
    dispatch_unknown: "bg-amber-500/15 text-amber-500",
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    awaiting_fetch: "bg-primary/15 text-primary",
    completed: "bg-emerald-500/15 text-emerald-400",
    failed: "bg-destructive/15 text-destructive",
    cancel_requested: "bg-amber-500/15 text-amber-500",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[status] ?? tone.queued}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-current"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
