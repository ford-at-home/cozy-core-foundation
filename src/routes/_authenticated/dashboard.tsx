import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ACTIVE_RUN_STATUSES,
  isPacketWorkflowRun,
  listMyRuns,
  type AgentRun,
} from "@/lib/workflows.functions";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";
import { draftRunToShared, packetStageToShared, SHARED_STAGE_LABELS } from "@/lib/packet-stage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: pageTitle("Dashboard") },
      { name: "description", content: "Your recent runs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type Project = {
  /** piece_id, or `run:<id>` for the rare pieceless run. */
  key: string;
  latest: AgentRun;
  count: number;
};

// A short, honest "the ball is in your court" line for longform projects
// waiting on the author. Returns null while a run is in flight (the status
// pill already says "Working") and for packets (their hub does the guiding).
function nextStepHint(run: AgentRun): string | null {
  if (ACTIVE_RUN_STATUSES.includes(run.status)) return null;
  if (run.status !== "completed") return null;
  if (isPacketWorkflowRun(run)) return null;
  switch (run.kind) {
    case "proposal":
    case "resynth":
      return "Your turn — approve the proposal or resynth it.";
    case "draft":
      return "Your turn — print it, mark it up, and dictate your changes.";
    case "revision":
      return "Your turn — approve the final version, or mark it up again.";
    default:
      return null;
  }
}

function DashboardPage() {
  const fetchRuns = useServerFn(listMyRuns);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent_runs", "recent"],
    queryFn: () => fetchRuns(),
  });

  // Research-packet runs open the guided project hub; drafts keep the run page.
  function openRun(run: AgentRun) {
    if (isPacketWorkflowRun(run) && run.piece_id) {
      router.navigate({ to: "/project/$pieceId", params: { pieceId: run.piece_id } });
    } else {
      router.navigate({ to: "/runs/$runId", params: { runId: run.id } });
    }
  }

  function runLabel(run: AgentRun): string {
    return isPacketWorkflowRun(run) ? `Research packet · ${run.kind}` : run.kind;
  }

  // A row-level shared verb without loading full packet state per row.
  // Packet runs use their internal `kind` mapped onto the packet stage; a
  // completed research/packet run means the user is at "Print"; a running
  // one means "Explore". Drafts use the same draft→shared mapping.
  function runStage(run: AgentRun): string {
    if (isPacketWorkflowRun(run)) {
      const completed = run.status === "completed";
      if (run.kind === "research") return SHARED_STAGE_LABELS[completed ? "print" : "explore"];
      if (run.kind === "packet") return SHARED_STAGE_LABELS[completed ? "think" : "explore"];
      if (run.kind === "followup_research")
        return SHARED_STAGE_LABELS[completed ? "finish" : "refine"];
      return SHARED_STAGE_LABELS[packetStageToShared("research")];
    }
    return SHARED_STAGE_LABELS[draftRunToShared(run.kind, run.status, false)];
  }

  const runs = useMemo(() => data?.runs ?? [], [data]);

  // Group runs into projects (one piece = one journey) so a longform piece's
  // research → proposal → draft → revision reads as a single row instead of
  // several. Runs without a piece (rare) stand alone. Ordered by latest
  // activity; the latest run of each project drives the row and the tap target.
  const projects = useMemo<Project[]>(() => {
    const groups = new Map<string, AgentRun[]>();
    for (const r of runs) {
      const key = r.piece_id ?? `run:${r.id}`;
      const existing = groups.get(key);
      if (existing) existing.push(r);
      else groups.set(key, [r]);
    }
    return Array.from(groups.entries())
      .map(([key, group]) => {
        const sorted = [...group].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        return { key, latest: sorted[0], count: group.length };
      })
      .sort(
        (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
      );
  }, [runs]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-5xl">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your most recent projects.</p>
        </div>
        <button
          type="button"
          onClick={() => router.navigate({ to: "/new" })}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
        >
          + New project
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        {isLoading && (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading runs">
            <Skeleton className="h-16 w-full rounded-lg sm:h-10" />
            <Skeleton className="h-16 w-full rounded-lg sm:h-10" />
            <Skeleton className="h-16 w-full rounded-lg sm:h-10" />
          </div>
        )}
        {error && (
          <div className="flex flex-col gap-3 p-6 sm:p-8">
            <div className="flex items-start gap-3 text-sm text-destructive">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="mt-0.5 shrink-0"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div>
                <p className="font-medium">Could not load your runs</p>
                <p className="text-destructive/80">{error.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["agent_runs", "recent"] })}
              className="inline-flex min-h-11 self-start items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && runs.length === 0 && (
          <div className="flex flex-col items-center gap-4 p-10 text-center sm:p-12">
            <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-background text-primary">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-serif text-xl">No projects yet</p>
              <p className="text-sm text-muted-foreground">Start one from the New project page.</p>
            </div>
            <button
              type="button"
              onClick={() => router.navigate({ to: "/new" })}
              className="mt-2 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Start your first project
            </button>
          </div>
        )}

        {/* Mobile-first: tappable cards. Table scales up from md. */}
        {!isLoading && !error && runs.length > 0 && (
          <>
            <ul className="divide-y divide-border md:hidden">
              {projects.map((p) => {
                const r = p.latest;
                const hint = nextStepHint(r);
                return (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => openRun(r)}
                      className="flex w-full min-h-14 flex-col gap-2 px-4 py-3.5 text-left transition-colors active:bg-accent/50 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                          <span className="capitalize">{runStage(r)}</span>
                          <span className="ml-2 text-xs font-normal capitalize text-muted-foreground">
                            {runLabel(r)}
                          </span>
                        </span>
                        <StatusPill status={r.status} />
                      </div>
                      {hint && <p className="text-xs text-primary/90">{hint}</p>}
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <time dateTime={r.created_at}>
                          {new Date(r.created_at).toLocaleString()}
                        </time>
                        {p.count > 1 && <span>{p.count} steps</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-background/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Created
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Stage
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Type
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Steps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const r = p.latest;
                    const hint = nextStepHint(r);
                    return (
                      <tr
                        key={p.key}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${runLabel(r)} project, ${r.status}`}
                        onClick={() => openRun(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openRun(r);
                          }
                        }}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
                      >
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div>{runStage(r)}</div>
                          {hint && <div className="mt-0.5 text-xs text-primary/80">{hint}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{runLabel(r)}</td>
                        <td className="px-5 py-3.5">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
                          {p.count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
