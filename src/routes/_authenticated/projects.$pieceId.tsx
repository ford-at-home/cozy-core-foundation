import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import { deriveJourney, runActivityLabel, runKindLabel, type JourneyStage } from "@/lib/journey";
import { listPacketsByPieceId, type Packet } from "@/lib/packets";
import { hasReturnedWork, listReturnsForPackets, type PacketReturn } from "@/lib/returns";
import {
  MAX_FOLLOWUP_QUESTIONS,
  addFollowupQuestion,
  approveFollowupQuestion,
  deleteFollowupQuestion,
  listFollowupQuestions,
  refineFollowups,
  reopenFollowup,
  skipFollowup,
  startFollowupResearch,
  unapproveFollowupQuestion,
  type FollowupQuestion,
} from "@/lib/followups";
import {
  ARTIFACT_LABELS,
  generateFinalArtifact,
  getArtifactDownloadUrl,
  listFinalArtifacts,
  type ArtifactKind,
  type FinalArtifact,
} from "@/lib/artifacts";
import { CREDIT_COST, isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";
import { Skeleton } from "@/components/ui/skeleton";

// The project hub: one place that always answers "where am I, what is
// happening, what do I do next" for a research-packet project. The journey
// is derived from domain data (src/lib/journey.ts) — never stored — and
// later steps stay hidden until they become real choices (progressive
// disclosure: no follow-up controls before verification, no output formats
// before that decision).
export const Route = createFileRoute("/_authenticated/projects/$pieceId")({
  head: () => ({
    meta: [{ title: pageTitle("Project") }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectHubPage,
});

type PieceRow = { id: string; title: string | null; slug: string; stage: string };
type RunRow = {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
};

const TERMINAL = ["completed", "failed", "cancelled"];

function ProjectHubPage() {
  const { pieceId } = Route.useParams();
  const [piece, setPiece] = useState<PieceRow | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [returns, setReturns] = useState<PacketReturn[]>([]);
  const [returned, setReturned] = useState(false);
  const [followups, setFollowups] = useState<FollowupQuestion[]>([]);
  const [artifacts, setArtifacts] = useState<FinalArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [{ data: pieceRow, error: pieceErr }, packetRows, { data: runRows, error: runErr }] =
      await Promise.all([
        supabase.from("pieces").select("id, title, slug, stage").eq("id", pieceId).maybeSingle(),
        listPacketsByPieceId(pieceId),
        supabase
          .from("agent_runs")
          .select("id, kind, status, error, created_at")
          .eq("piece_id", pieceId)
          .order("created_at", { ascending: false }),
      ]);
    if (pieceErr) throw new Error(pieceErr.message);
    if (runErr) throw new Error(runErr.message);
    setPiece((pieceRow as PieceRow) ?? null);
    setPackets(packetRows);
    setRuns((runRows ?? []) as RunRow[]);

    const returnRows = await listReturnsForPackets(packetRows.map((p) => p.id));
    setReturns(returnRows);
    const [returnedWork, artifactRows, followupRows] = await Promise.all([
      hasReturnedWork(returnRows.map((r) => r.id)),
      listFinalArtifacts(pieceId),
      packetRows.length > 0 ? listFollowupQuestions(packetRows[0].id) : Promise.resolve([]),
    ]);
    setReturned(returnedWork);
    setArtifacts(artifactRows);
    setFollowups(followupRows);
  }, [pieceId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    reload()
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    // Live refresh as runs progress (packet build, follow-up research, …).
    const channel = supabase
      .channel(`project-${pieceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_runs",
          filter: `piece_id=eq.${pieceId}`,
        },
        () => {
          reload().catch(() => {});
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [pieceId, reload]);

  const newestPacket = packets[0] ?? null;
  const verifiedReturn = returns.find((r) => r.status === "verified") ?? null;

  const journey = useMemo(() => {
    const followupState = !newestPacket
      ? ("none" as const)
      : newestPacket.followup_state === "researching"
        ? ("running" as const)
        : newestPacket.followup_state === "researched"
          ? ("done" as const)
          : newestPacket.followup_state === "skipped"
            ? ("skipped" as const)
            : ("none" as const);
    return deriveJourney({
      packetRuns: runs
        .filter((r) => r.kind === "packet")
        .map((r) => ({ id: r.id, status: r.status as never })),
      packet: newestPacket
        ? { id: newestPacket.id, status: newestPacket.status, version: newestPacket.version }
        : null,
      packetReturn: verifiedReturn
        ? { status: "verified" }
        : returns.length > 0
          ? { status: "collecting" }
          : null,
      hasReturnedWork: returned,
      followup: { state: followupState },
      artifacts: {
        document: artifacts.some((a) => a.kind === "document"),
        presentation: artifacts.some((a) => a.kind === "presentation"),
      },
    });
  }, [runs, newestPacket, verifiedReturn, returns, returned, artifacts]);

  const activeRun = runs.find((r) => !TERMINAL.includes(r.status)) ?? null;
  const failedRun =
    !activeRun && journey.currentStage === "research"
      ? (runs.find((r) => r.status === "failed") ?? null)
      : null;

  const verified = verifiedReturn !== null;
  const followupResolved =
    newestPacket?.followup_state === "skipped" || newestPacket?.followup_state === "researched";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 break-words font-serif text-3xl tracking-tight sm:text-5xl">
          {piece?.title ?? "Your project"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything for this project, in order — one step at a time.
        </p>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading project">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {!loading && !error && !piece && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Project not found.{" "}
          <Link to="/dashboard" className="underline hover:text-foreground">
            Back to your projects
          </Link>
        </div>
      )}

      {!loading && !error && piece && (
        <>
          {activeRun && (
            <div
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
              aria-live="polite"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="min-w-0">
                <span className="font-medium">
                  {runActivityLabel(activeRun.kind, activeRun.status)}…
                </span>{" "}
                <span className="text-muted-foreground">
                  This runs on its own — you can leave and come back.
                </span>
              </span>
              <Link
                to="/runs/$runId"
                params={{ runId: activeRun.id }}
                className="ml-auto inline-flex min-h-11 shrink-0 items-center px-2 text-xs text-muted-foreground underline hover:text-foreground sm:min-h-0"
              >
                Details
              </Link>
            </div>
          )}

          {failedRun && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <p className="font-medium">
                {runKindLabel(failedRun.kind)} didn't finish. You were not charged for incomplete
                work.
              </p>
              {failedRun.error && <p className="mt-1 text-destructive/80">{failedRun.error}</p>}
              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  to="/new"
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Try again
                </Link>
                <Link
                  to="/runs/$runId"
                  params={{ runId: failedRun.id }}
                  className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline hover:text-foreground"
                >
                  What happened
                </Link>
              </div>
            </div>
          )}

          <StageRail stages={journey.stages} />

          {/* The primary next step for the current stage. */}
          {newestPacket && journey.currentStage === "print" && (
            <StageCard
              title={
                newestPacket.version > 1
                  ? "Your revised packet is ready"
                  : "Your packet is ready to review"
              }
              body={
                newestPacket.version > 1
                  ? 'It opens with a "What changed" section covering your follow-up questions. Review it, then print — printing is free.'
                  : "Read the questions, adjust any you want, then approve and print. Printing is free."
              }
              action={
                <Link
                  to="/packet/$runId"
                  params={{ runId: newestPacket.run_id }}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
                >
                  Review &amp; print your packet →
                </Link>
              }
            />
          )}

          {newestPacket &&
            (journey.currentStage === "paper" || journey.currentStage === "return") && (
              <StageCard
                title="Work on paper, then bring it back"
                body="Read, annotate, and answer in your packet — at your own pace, away from the screen. When you're done, photograph your pages or dictate your answers. Returning work is free."
                action={
                  <Link
                    to="/return/$runId"
                    params={{ runId: newestPacket.run_id }}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
                  >
                    Return your work →
                  </Link>
                }
                secondary={
                  <Link
                    to="/print/$runId"
                    params={{ runId: newestPacket.run_id }}
                    className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline hover:text-foreground sm:min-h-0"
                  >
                    Print the packet again
                  </Link>
                }
              />
            )}

          {newestPacket && journey.currentStage === "review" && (
            <StageCard
              title="Check what we read"
              body="We read your handwriting and dictation. Before any of it is used, confirm we got it right — your corrections always win."
              action={
                <Link
                  to="/verify/$runId"
                  params={{ runId: newestPacket.run_id }}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
                >
                  Check the reading →
                </Link>
              }
            />
          )}

          {/* Follow-up research appears only once the reading is confirmed. */}
          {newestPacket && verified && (
            <FollowupPanel packet={newestPacket} questions={followups} onChanged={reload} />
          )}

          {/* Final materials appear only after the follow-up decision. */}
          {newestPacket && verified && followupResolved && (
            <FinishPanel pieceId={pieceId} artifacts={artifacts} onChanged={reload} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StageRail({ stages }: { stages: JourneyStage[] }) {
  return (
    <ol className="space-y-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      {stages.map((s, i) => (
        <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < stages.length - 1 && (
            <span
              aria-hidden
              className={
                "absolute left-[7px] top-5 h-full w-px " +
                (s.state === "done" ? "bg-primary/50" : "bg-border")
              }
            />
          )}
          <span
            aria-hidden
            className={
              "relative mt-1 grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border " +
              (s.state === "done"
                ? "border-primary bg-primary"
                : s.state === "current"
                  ? "border-primary bg-background"
                  : "border-border bg-background")
            }
          >
            {s.state === "done" && (
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                className="text-primary-foreground"
              >
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <div className="min-w-0">
            <p
              className={
                "text-sm font-medium " +
                (s.state === "current"
                  ? ""
                  : s.state === "done"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60")
              }
            >
              {s.label}
              {s.state === "current" && (
                <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  You are here
                </span>
              )}
            </p>
            {s.state === "current" && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {s.description}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StageCard({
  title,
  body,
  action,
  secondary,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        {action}
        {secondary}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Follow-up research (optional, 2 credits; skipping is explicit and free).

function FollowupPanel({
  packet,
  questions,
  onChanged,
}: {
  packet: Packet;
  questions: FollowupQuestion[];
  onChanged: () => Promise<void>;
}) {
  const { balance } = useCreditBalance();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approved = questions.filter((q) => q.status === "approved");
  const cost = CREDIT_COST.followup;
  const outOfCredits = balance !== null && balance < cost;

  async function act(label: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(
        isInsufficientCreditsError(message)
          ? "Not enough credits for follow-up research. You were not charged."
          : message,
      );
    } finally {
      setBusy(null);
    }
  }

  if (packet.followup_state === "researching") {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-serif text-2xl">Follow-up research</h2>
        <p className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          We're researching your questions now, then building a revised packet with a "What changed"
          section. This runs on its own — you can leave and come back.
        </p>
      </section>
    );
  }

  if (packet.followup_state === "researched") {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-serif text-2xl">Follow-up research</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Done — your questions were researched and folded into a revised packet.
        </p>
      </section>
    );
  }

  if (packet.followup_state === "skipped") {
    return (
      <section className="space-y-2 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-serif text-2xl">Follow-up research</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You chose to go straight to your final materials.{" "}
          <button
            type="button"
            onClick={() => act("reopen", () => reopenFollowup(packet.id))}
            className="underline hover:text-foreground"
          >
            Changed your mind?
          </button>
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="font-serif text-2xl">Follow-up research — optional</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Working on paper usually raises new questions. Pick up to {MAX_FOLLOWUP_QUESTIONS} and
          we'll run a focused second research pass ({cost} credits, revised packet included) — or
          skip straight to your final materials, free.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {questions.length > 0 && (
        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="rounded-md border border-border/60 px-3 py-2.5 text-sm">
              <p className="leading-relaxed">{q.student_text}</p>
              {q.suggested_text && q.status !== "approved" && (
                <p className="mt-1.5 rounded bg-muted/60 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                  Suggested sharper phrasing: <span className="italic">{q.suggested_text}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {q.status === "approved" ? (
                  <>
                    <span className="inline-flex items-center rounded border border-emerald-500/50 px-2 py-1 text-xs text-emerald-400">
                      Will be researched
                      {q.approved_text !== q.student_text ? " (suggested phrasing)" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        act(`unapprove-${q.id}`, () => unapproveFollowupQuestion(q.id))
                      }
                      className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                    >
                      Undo
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        act(`approve-${q.id}`, () => approveFollowupQuestion(q, false))
                      }
                      className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                    >
                      Research my wording
                    </button>
                    {q.suggested_text && (
                      <button
                        type="button"
                        onClick={() =>
                          act(`approve-s-${q.id}`, () => approveFollowupQuestion(q, true))
                        }
                        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                      >
                        Use the suggestion
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => act(`delete-${q.id}`, () => deleteFollowupQuestion(q.id))}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {questions.length < MAX_FOLLOWUP_QUESTIONS && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            act("add", async () => {
              await addFollowupQuestion(packet.id, text);
              setDraft("");
            });
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What do you still want to know?"
            aria-label="New follow-up question"
            className="min-h-11 w-full rounded-md border border-input bg-background/60 px-3.5 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy !== null || draft.trim() === ""}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
          >
            Add question
          </button>
        </form>
      )}

      {questions.length > 0 && !questions.every((q) => q.suggested_text) && (
        <button
          type="button"
          onClick={() => act("refine", () => refineFollowups(packet.id))}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        >
          {busy === "refine" ? "Thinking…" : "Suggest sharper phrasings (free)"}
        </button>
      )}

      {outOfCredits && approved.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Follow-up research uses {cost} credits and you have {balance}.{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => act("start", () => startFollowupResearch(packet.id, crypto.randomUUID()))}
          disabled={busy !== null || approved.length === 0 || outOfCredits}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
        >
          {busy === "start"
            ? "Starting…"
            : `Research ${approved.length > 0 ? `${approved.length} question${approved.length === 1 ? "" : "s"}` : "my questions"} (${cost} credits)`}
        </button>
        <button
          type="button"
          onClick={() => act("skip", () => skipFollowup(packet.id))}
          disabled={busy !== null}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
        >
          Skip — go to final materials (free)
        </button>
      </div>
      {approved.length === 0 && questions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Mark at least one question "Research my wording" (or use a suggestion) to start.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final materials (paper 1 credit, presentation 1 credit; downloads free).

function FinishPanel({
  pieceId,
  artifacts,
  onChanged,
}: {
  pieceId: string;
  artifacts: FinalArtifact[];
  onChanged: () => Promise<void>;
}) {
  const { balance } = useCreditBalance();
  const [busy, setBusy] = useState<ArtifactKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paper = artifacts.find((a) => a.kind === "document") ?? null;
  const deck = artifacts.find((a) => a.kind === "presentation") ?? null;
  const outOfCredits = balance !== null && balance < 1;

  async function generate(kind: ArtifactKind) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await generateFinalArtifact(pieceId, kind, crypto.randomUUID());
      await onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(
        isInsufficientCreditsError(message)
          ? "Not enough credits for this generation. You were not charged."
          : message,
      );
    } finally {
      setBusy(null);
    }
  }

  async function download(artifact: FinalArtifact) {
    setError(null);
    try {
      const url = await getArtifactDownloadUrl(artifact);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a download link");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="font-serif text-2xl">Final materials</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Your paper and presentation are built from your confirmed work — your answers and notes
          shape the argument. Each costs 1 credit to create; downloading again is free. If a
          generation fails, you are not charged.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {outOfCredits && (!paper || !deck) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Creating a final document uses 1 credit and you have {balance}.{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </div>
      )}

      <div className="space-y-3">
        <ArtifactRow
          label={ARTIFACT_LABELS.document}
          detail="A Word document (.docx) you'll revise and hand in — with markers where your own voice should go."
          artifact={paper}
          busy={busy === "document"}
          disabled={busy !== null || (!paper && outOfCredits)}
          onGenerate={() => generate("document")}
          onDownload={download}
        />
        <ArtifactRow
          label={ARTIFACT_LABELS.presentation}
          detail="Slides (.pptx) built from your paper, with speaker notes for each slide."
          artifact={deck}
          busy={busy === "presentation"}
          disabled={busy !== null || (!deck && (outOfCredits || !paper))}
          disabledReason={
            !paper ? "Create the final paper first — the presentation is built from it." : undefined
          }
          onGenerate={() => generate("presentation")}
          onDownload={download}
        />
      </div>
    </section>
  );
}

function ArtifactRow({
  label,
  detail,
  artifact,
  busy,
  disabled,
  disabledReason,
  onGenerate,
  onDownload,
}: {
  label: string;
  detail: string;
  artifact: FinalArtifact | null;
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
  onGenerate: () => void;
  onDownload: (artifact: FinalArtifact) => void;
}) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {artifact ? (artifact.title ?? detail) : detail}
          </p>
        </div>
        {artifact ? (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onDownload(artifact)}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={disabled}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create a fresh version (1 credit)"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={disabled}
            title={disabledReason}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
          >
            {busy ? "Creating… (about a minute)" : `Create (1 credit)`}
          </button>
        )}
      </div>
      {disabledReason && !artifact && (
        <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
}
