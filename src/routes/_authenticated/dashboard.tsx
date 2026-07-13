import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { projectStageLabel, runActivityLabel } from "@/lib/journey";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";

// Project-based dashboard (the clarity pass): one row per project with a
// plain-language stage label and live activity, instead of raw runs and
// machine kinds. Research packets open their project hub; drafts open
// their latest run. Raw run detail stays reachable from each project.
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: pageTitle("Projects") },
      { name: "description", content: "Your projects." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type PieceRow = {
  id: string;
  title: string | null;
  slug: string;
  stage: string;
  workflow: string;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  piece_id: string | null;
  kind: string;
  status: string;
  created_at: string;
};

const ACTIVE = [
  "requested",
  "dispatching",
  "dispatch_unknown",
  "queued",
  "running",
  "awaiting_fetch",
  "cancel_requested",
];

async function loadProjects(): Promise<{ pieces: PieceRow[]; runsByPiece: Map<string, RunRow[]> }> {
  const [piecesRes, runsRes] = await Promise.all([
    supabase
      .from("pieces")
      .select("id, title, slug, stage, workflow, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_runs")
      .select("id, piece_id, kind, status, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  if (piecesRes.error) throw new Error(piecesRes.error.message);
  if (runsRes.error) throw new Error(runsRes.error.message);
  const runsByPiece = new Map<string, RunRow[]>();
  for (const run of (runsRes.data ?? []) as RunRow[]) {
    if (!run.piece_id) continue;
    const list = runsByPiece.get(run.piece_id) ?? [];
    list.push(run);
    runsByPiece.set(run.piece_id, list);
  }
  return { pieces: (piecesRes.data ?? []) as PieceRow[], runsByPiece };
}

/** One line per project: activity if something is running, otherwise stage. */
function projectLine(
  piece: PieceRow,
  runs: RunRow[],
): { label: string; live: boolean; failed: boolean } {
  const active = runs.find((r) => ACTIVE.includes(r.status));
  if (active)
    return { label: runActivityLabel(active.kind, active.status), live: true, failed: false };
  const newest = runs[0];
  if (newest?.status === "failed") {
    return { label: "Didn't finish — open to retry", live: false, failed: true };
  }
  return { label: projectStageLabel(piece.workflow, piece.stage), live: false, failed: false };
}

function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", "recent"],
    queryFn: loadProjects,
    refetchInterval: 15_000,
  });

  function openProject(piece: PieceRow, runs: RunRow[]) {
    if (piece.workflow === "research_packet") {
      router.navigate({ to: "/projects/$pieceId", params: { pieceId: piece.id } });
      return;
    }
    const newest = runs[0];
    if (newest) router.navigate({ to: "/runs/$runId", params: { runId: newest.id } });
  }

  const pieces = data?.pieces ?? [];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight sm:text-5xl">Projects</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each project shows where it stands and what happens next.
          </p>
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
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading projects">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
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
                <p className="font-medium">Could not load your projects</p>
                <p className="text-destructive/80">{(error as Error).message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["projects", "recent"] })}
              className="inline-flex min-h-11 self-start items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && pieces.length === 0 && (
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
              <p className="text-sm text-muted-foreground">
                Start a working draft or a research packet.
              </p>
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

        {!isLoading && !error && pieces.length > 0 && (
          <ul className="divide-y divide-border">
            {pieces.map((piece) => {
              const runs = data?.runsByPiece.get(piece.id) ?? [];
              const line = projectLine(piece, runs);
              return (
                <li key={piece.id}>
                  <button
                    type="button"
                    onClick={() => openProject(piece, runs)}
                    className="flex w-full min-h-14 flex-col gap-1.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 active:bg-accent/50 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {piece.title ?? piece.slug}
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {piece.workflow === "research_packet" ? "Research packet" : "Draft"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={
                          "flex min-w-0 items-center gap-2 truncate text-xs " +
                          (line.failed
                            ? "text-destructive"
                            : line.live
                              ? "text-primary"
                              : "text-muted-foreground")
                        }
                      >
                        {line.live && (
                          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        )}
                        <span className="truncate">{line.label}</span>
                      </span>
                      <time
                        dateTime={piece.updated_at}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {new Date(piece.updated_at).toLocaleDateString()}
                      </time>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Course assignments have no nav tab (students only need it
          occasionally); this is the mobile-reachable path besides /new. */}
      <p className="text-sm text-muted-foreground">
        In a class?{" "}
        <Link
          to="/assignments"
          className="inline-flex min-h-11 items-center underline hover:text-foreground sm:min-h-0"
        >
          Join your course and see assignments →
        </Link>
      </p>
    </div>
  );
}
