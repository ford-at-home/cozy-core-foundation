import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import {
  getPiece,
  listArtifactsByPiece,
  listFollowupsByPackets,
  listPacketsByPiece,
  listRunsByPiece,
  loadReturnSummaries,
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
      const [piece, runs, packets, artifacts] = await Promise.all([
        getPiece(pieceId),
        listRunsByPiece(pieceId),
        listPacketsByPiece(pieceId),
        listArtifactsByPiece(pieceId),
      ]);
      const packetIds = packets.map((p) => p.id);
      const [returns, followups] = await Promise.all([
        loadReturnSummaries(packetIds),
        listFollowupsByPackets(packetIds),
      ]);
      return { piece, runs, packets, returns, followups, artifacts };
    },
    refetchInterval: (query) => {
      // Poll while anything is in flight; realtime below covers the common
      // transitions, polling covers everything else.
      const d = query.state.data;
      if (!d) return false;
      const busyRun = d.runs.some((r) => !["completed", "failed", "cancelled"].includes(r.status));
      const busyReturn = d.returns.some((r) => r.uiStatus === "recognizing");
      const busyArtifact = d.artifacts.some((a) => ["pending", "generating"].includes(a.status));
      return busyRun || busyReturn || busyArtifact ? 5000 : false;
    },
  });

  useEffect(() => {
    // agent_runs is in the realtime publication; the return/artifact tables
    // are not, so their transitions are covered by the polling above.
    const channel = supabase
      .channel(`project-${pieceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs" }, () =>
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
        returns: data.returns.map((r): StageReturn => ({
          id: r.id,
          status: r.uiStatus,
          created_at: r.created_at,
        })),
        followups: data.followups as StageFollowup[],
        artifacts: data.artifacts
          .filter((a) => a.kind === "docx" || a.kind === "pptx")
          .map((a): StageArtifact => ({
            id: a.id,
            kind: a.kind as "docx" | "pptx",
            status: a.status,
            created_at: a.created_at,
          })),
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
          <StageCard
            view={view}
            pieceId={pieceId}
            followupRun={
              data.runs.find(
                (r) =>
                  r.kind === "followup_research" &&
                  !["completed", "failed", "cancelled"].includes(r.status),
              ) ?? null
            }
            revisedPacket={
              (view.packet?.version ?? 1) > 1
                ? (data.packets.find((p) => p.id === view.packet?.id) ?? null)
                : null
            }
          />
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

function StageCard({
  view,
  pieceId,
  followupRun,
  revisedPacket,
}: {
  view: PacketWorkflowView;
  pieceId: string;
  /** Non-terminal followup_research run, if one is in flight. */
  followupRun: { id: string } | null;
  /** The latest packet when it's a follow-up product (version > 1). */
  revisedPacket: { id: string; run_id: string; status: string } | null;
}) {
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
          <Link to="/print/$runId" params={{ runId: packetRunId }} className={secondaryBtn}>
            Print the packet
          </Link>
          {view.packet && (
            <Link
              to="/return/$packetId"
              params={{ packetId: view.packet.id }}
              className={primaryBtn}
            >
              I'm done — return my work
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          When you've finished on paper, return your pages as photos, dictate your answers, or both.
          Returning and reading are free.
        </p>
      </StageShell>
    );
  }

  if (view.current === "return" && view.packet) {
    return (
      <StageShell title="Return" status="Waiting for your pages">
        <p>
          Your return is open — continue photographing pages or dictating answers, then send it for
          reading. You can leave and come back; nothing is lost.
        </p>
        <Link to="/return/$packetId" params={{ packetId: view.packet.id }} className={primaryBtn}>
          Continue returning your work
        </Link>
      </StageShell>
    );
  }

  if (view.current === "review") {
    const recognizing = view.latestReturn?.status === "recognizing";
    return (
      <StageShell title="Review" status={recognizing ? "Reading your notes…" : "Ready for review"}>
        <p>
          {recognizing
            ? "Your pages are being read. This takes a minute or two — this page updates on its own."
            : "Your returned work has been read. Check what the system understood, fix anything it got wrong, and approve. Only your approved words move forward."}
        </p>
        {!recognizing && view.latestReturn && (
          <Link
            to="/review/$returnId"
            params={{ returnId: view.latestReturn.id }}
            className={primaryBtn}
          >
            Review what was read
          </Link>
        )}
      </StageShell>
    );
  }

  if (view.current === "follow_up") {
    if (view.followupResearchActive) {
      return (
        <StageShell title="Follow up" status="Researching your questions…" optional>
          <p>
            The second research pass is running against your approved questions. It usually takes a
            few minutes and arrives as a revised packet — your original packet stays untouched.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {followupRun && (
              <Link to="/runs/$runId" params={{ runId: followupRun.id }} className={secondaryBtn}>
                Watch progress
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            You can close this page — the work continues, and this project picks up where it left
            off.
          </p>
        </StageShell>
      );
    }
    return (
      <StageShell title="Follow up" status="Your questions, researched" optional>
        <p>
          Submit up to three follow-up research questions — from your handwriting, dictation, or
          typed directly — and a focused second research pass answers them with authoritative
          sources. This step is optional and costs 2 credits only when you run it.
        </p>
        {view.packet && (
          <Link
            to="/followup/$packetId"
            params={{ packetId: view.packet.id }}
            className={primaryBtn}
          >
            Ask follow-up questions
          </Link>
        )}
      </StageShell>
    );
  }

  return (
    <StageShell
      title="Finish"
      status={view.docx?.status === "ready" ? "Ready to download" : "Almost there"}
    >
      {revisedPacket && (
        <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-foreground">
            Your follow-up research is in — a revised packet answers your questions with new
            evidence. Your original packet is preserved unchanged.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/packet/$runId"
              params={{ runId: revisedPacket.run_id }}
              className={secondaryBtn}
            >
              Review the revised questions
            </Link>
            <Link
              to="/print/$runId"
              params={{ runId: revisedPacket.run_id }}
              className={secondaryBtn}
            >
              Print the revised packet
            </Link>
          </div>
        </div>
      )}
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
