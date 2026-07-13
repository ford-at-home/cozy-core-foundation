import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import {
  getPiece,
  listArtifactsByPiece,
  listFollowupsByPiece,
  listPacketsByPiece,
  listReturnsByPiece,
  listRunsByPiece,
} from "@/lib/packet-workflow";
import {
  derivePacketWorkflow,
  type PacketWorkflowView,
  type StageArtifact,
  type StageFollowup,
  type StagePacket,
  type StageReturn,
  type StageRun,
} from "@/lib/packet-stage";
import { Skeleton } from "@/components/ui/skeleton";

// The guided hub for one research-packet project: one authoritative stage
// model (src/lib/packet-stage.ts, derived from server-persisted rows), one
// primary action per stage, plain-language statuses. Students can leave and
// return at any point — everything here is persisted server-side.
export const Route = createFileRoute("/_authenticated/project/$pieceId")({
  head: () => ({
    meta: [{ title: pageTitle("Research project") }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectHubPage,
});

function ProjectHubPage() {
  const { pieceId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["project", pieceId],
    queryFn: async () => {
      const [piece, runs, packets, returns, followups, artifacts] = await Promise.all([
        getPiece(pieceId),
        listRunsByPiece(pieceId),
        listPacketsByPiece(pieceId),
        listReturnsByPiece(pieceId),
        listFollowupsByPiece(pieceId),
        listArtifactsByPiece(pieceId),
      ]);
      return { piece, runs, packets, returns, followups, artifacts };
    },
    refetchInterval: (query) => {
      // Poll while anything is in flight; realtime below covers the common
      // transitions, polling covers everything else.
      const d = query.state.data;
      if (!d) return false;
      const busyRun = d.runs.some((r) => !["completed", "failed", "cancelled"].includes(r.status));
      const busyReturn = d.returns.some((r) => r.status === "recognizing");
      const busyArtifact = d.artifacts.some((a) => a.status === "generating");
      return busyRun || busyReturn || busyArtifact ? 5000 : false;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`project-${pieceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs" }, () =>
        queryClient.invalidateQueries({ queryKey: ["project", pieceId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "packet_returns" }, () =>
        queryClient.invalidateQueries({ queryKey: ["project", pieceId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "final_artifacts" }, () =>
        queryClient.invalidateQueries({ queryKey: ["project", pieceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pieceId, queryClient]);

  const view = data
    ? derivePacketWorkflow({
        runs: data.runs as StageRun[],
        packets: data.packets as StagePacket[],
        returns: data.returns as StageReturn[],
        followups: data.followups as StageFollowup[],
        artifacts: data.artifacts as StageArtifact[],
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Research project</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Start with a question. {brand.company.name} researches the subject and prepares a packet
          you print, read, and mark by hand. Return your pages or dictate your thoughts, review what
          the system understood, then create a final document shaped by your own reasoning. You can
          leave and come back — everything here is saved.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading project">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : "Could not load this project."}
        </p>
      )}

      {!isLoading && !error && data && !data.piece && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Project not found. It may belong to another account.
        </div>
      )}

      {data?.piece && data.piece.workflow !== "research_packet" && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          This is a working draft, not a research packet — its runs live on the{" "}
          <Link to="/dashboard" className="underline">
            dashboard
          </Link>
          .
        </div>
      )}

      {data?.piece && data.piece.workflow === "research_packet" && view && (
        <>
          <StageStepper view={view} />
          <StageCard view={view} pieceId={pieceId} />
          <WhoDoesWhat />
        </>
      )}
    </div>
  );
}

function StageStepper({ view }: { view: PacketWorkflowView }) {
  return (
    <ol
      className="flex flex-wrap items-center gap-y-2 rounded-xl border border-border bg-card px-3 py-3 sm:px-4"
      aria-label="Workflow stages"
    >
      {view.stages.map((s, i) => (
        <li key={s.key} className="flex items-center">
          {i > 0 && <span className="mx-1.5 text-border sm:mx-2">—</span>}
          <span
            aria-current={s.state === "current" ? "step" : undefined}
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium sm:text-xs " +
              (s.state === "current"
                ? "bg-primary/15 text-primary"
                : s.state === "complete"
                  ? "text-emerald-500"
                  : "text-muted-foreground")
            }
          >
            {s.state === "complete" ? "✓ " : ""}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

const primaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto";
const secondaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto";

function StageCard({ view, pieceId }: { view: PacketWorkflowView; pieceId: string }) {
  void pieceId;
  const packetRunId = view.packet?.run_id ?? null;

  if (view.current === "research") {
    if (view.activeRun) {
      const label =
        view.activeRun.kind === "research" ? "Gathering sources…" : "Building your packet…";
      return (
        <StageShell title="Research" status={label}>
          <p>
            {view.activeRun.kind === "research"
              ? "Deep research is running — reading sources and assembling evidence. This usually takes 2–10 minutes."
              : "The research is done; your packet — findings, sources, and questions written for this specific research — is being prepared."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/runs/$runId" params={{ runId: view.activeRun.id }} className={secondaryBtn}>
              Watch progress
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            You can close this page — the work continues, and this project picks up where it left
            off.
          </p>
        </StageShell>
      );
    }
    if (view.failedRun) {
      return (
        <StageShell title="Research" status="Something needs another try" tone="error">
          <p>
            The research run didn't finish. Nothing you entered was lost, and any credit held for it
            was released — you were not charged.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/new" className={primaryBtn}>
              Start the research again
            </Link>
            <Link to="/runs/$runId" params={{ runId: view.failedRun.id }} className={secondaryBtn}>
              See what happened
            </Link>
          </div>
        </StageShell>
      );
    }
    return (
      <StageShell title="Research" status="Waiting to start">
        <p>No research has started for this project yet.</p>
        <Link to="/new" className={primaryBtn}>
          Start with a question
        </Link>
      </StageShell>
    );
  }

  if (view.current === "print" && packetRunId) {
    return (
      <StageShell title="Print" status="Your packet is ready to review">
        <p>
          The packet's questions were written for this research — each names the claim or evidence
          it asks about. Look them over, adjust any wording, then approve and print. Reviewing and
          printing are free.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/packet/$runId" params={{ runId: packetRunId }} className={primaryBtn}>
            Review the questions
          </Link>
        </div>
      </StageShell>
    );
  }

  if (view.current === "think" && packetRunId) {
    return (
      <StageShell title="Think" status="Waiting for your pages">
        <p>
          Print the packet and work through it away from the screen: read, annotate, answer the
          questions in the writing space, and note up to three follow-up research questions of your
          own. Use dark ink and keep the page numbers visible.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/print/$runId" params={{ runId: packetRunId }} className={primaryBtn}>
            Print the packet
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          When you've finished on paper, come back here to return your work.
        </p>
      </StageShell>
    );
  }

  // Stages beyond Think are implemented in the return/verification and
  // follow-up phases; the hub shows honest status for rows that exist.
  if (view.current === "return") {
    return (
      <StageShell title="Return" status="Waiting for your pages">
        <p>Your return is open. Continue uploading pages or dictating responses.</p>
      </StageShell>
    );
  }

  if (view.current === "review") {
    return (
      <StageShell
        title="Review"
        status={
          view.latestReturn?.status === "recognizing" ? "Reading your notes…" : "Ready for review"
        }
      >
        <p>
          {view.latestReturn?.status === "recognizing"
            ? "Your pages are being read. This takes a minute or two."
            : "Your returned work has been read. Review what the system understood and correct anything it got wrong."}
        </p>
      </StageShell>
    );
  }

  if (view.current === "follow_up") {
    return (
      <StageShell title="Follow up" status="Your questions, researched" optional>
        <p>
          Submit up to three follow-up research questions — from your handwriting, dictation, or
          typed here — and a focused second research pass answers them. This step is optional.
        </p>
      </StageShell>
    );
  }

  return (
    <StageShell
      title="Finish"
      status={view.docx?.status === "ready" ? "Ready to download" : "Almost there"}
    >
      <p>
        Create a final, editable document built from the research and your verified contributions.
      </p>
    </StageShell>
  );
}

function StageShell({
  title,
  status,
  tone,
  optional,
  children,
}: {
  title: string;
  status: string;
  tone?: "error";
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        "space-y-4 rounded-xl border bg-card p-5 text-card-foreground sm:p-6 " +
        (tone === "error" ? "border-destructive/40" : "border-border")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
        <span
          className={
            "rounded-full border px-3 py-1 text-xs font-medium " +
            (tone === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10")
          }
        >
          {status}
        </span>
        {optional && <span className="text-xs text-muted-foreground">optional</span>}
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&>p:first-child]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function WhoDoesWhat() {
  return (
    <details className="rounded-xl border border-border bg-card p-5 text-sm sm:p-6">
      <summary className="min-h-11 cursor-pointer list-none font-medium">
        How this works — what you do, what the system does
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">You</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>read and reflect</li>
            <li>annotate and answer on paper</li>
            <li>question what you find</li>
            <li>verify what the system understood</li>
            <li>decide what deserves further research</li>
            <li>approve the final work</li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            The system
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>gathers research and organizes evidence</li>
            <li>writes questions tailored to that research</li>
            <li>reads your returned pages</li>
            <li>researches the follow-up questions you approve</li>
            <li>prepares the final materials for your review</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
