import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_RUN_STATUSES,
  isPacketWorkflowRun,
  type AgentRun,
  type RunStatus,
} from "@/lib/workflows.functions";
import {
  approveRevisionPr,
  checkRevisionPrStatus,
  runPieceAction,
  type PieceAction,
} from "@/lib/pieces.functions";
import { CREDIT_COST, isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";
import type { Json } from "@/integrations/supabase/types";
import MarkdownView from "@/components/MarkdownView";
import { interpretRunError } from "@/lib/run-error";
import { RunCostCard } from "@/components/RunCostCard";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";
import { useDictation } from "@/hooks/use-dictation";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Run") }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    // Set by the revision panel's "not quite" CTA so the draft page can
    // scroll to the dictation panel and prompt the user to mark up the
    // revision they just came from.
    fromRevision: typeof search.fromRevision === "string" ? search.fromRevision : undefined,
  }),
  component: RunDetailPage,
});

// Result shape written by the worker, mirrored from the studio compose flow.
type OutputFile = { name: string; content: string };
type OutputChannel = { channel: string; files: OutputFile[] };
type GeneratedBrief = { path?: string; content: string };
const BRIEF_TAB = "__brief__";

const RUN_COLUMNS =
  "id, user_id, piece_id, session_id, provider, total_cost_usd, status, kind, input, result, error, branch, external_agent_id, created_at, dispatched_at, completed_at";

/** Prefer the more advanced lifecycle snapshot so a slow initial fetch cannot
 *  overwrite a newer realtime UPDATE (e.g. completed → running). */
const STATUS_RANK: Record<string, number> = {
  requested: 0,
  dispatching: 1,
  dispatch_unknown: 2,
  queued: 3,
  running: 4,
  awaiting_fetch: 5,
  cancel_requested: 6,
  completed: 7,
  failed: 7,
  cancelled: 7,
};

function isFresherRun(incoming: AgentRun, current: AgentRun | null): boolean {
  if (!current || current.id !== incoming.id) return true;
  const iRank = STATUS_RANK[incoming.status] ?? 0;
  const cRank = STATUS_RANK[current.status] ?? 0;
  if (iRank !== cRank) return iRank > cRank;
  if (incoming.completed_at && !current.completed_at) return true;
  if (!incoming.completed_at && current.completed_at) return false;
  if (incoming.result && !current.result) return true;
  if (!incoming.result && current.result) return false;
  if (incoming.error && !current.error) return true;
  return false;
}

function RunDetailPage() {
  const { runId } = Route.useParams();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRun(null);
    setLoadError(null);
    setLoading(true);
    setActiveFile(null);

    supabase
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("id", runId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
        } else if (!data) {
          setLoadError("Run not found.");
        } else {
          const incoming = data as AgentRun;
          setRun((prev) => (isFresherRun(incoming, prev) ? incoming : prev));
          setLoadError(null);
        }
        setLoading(false);
      });

    // Live updates as the controller moves the run through the state machine.
    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
        (payload) => {
          if (cancelled) return;
          const incoming = payload.new as AgentRun;
          setRun((prev) => (isFresherRun(incoming, prev) ? incoming : prev));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [runId]);

  const { brief, channels, nextRunId } = useMemo(
    () => parseResult(run?.result ?? null),
    [run?.result],
  );

  // Default the visible tab once results arrive: post.md if present, else brief.
  useEffect(() => {
    if (activeFile) return;
    const def = pickDefaultFile(channels, brief);
    if (def) setActiveFile(def);
  }, [channels, brief, activeFile]);

  const activeContent = useMemo(() => {
    if (activeFile === BRIEF_TAB) return brief?.content ?? "";
    for (const ch of channels) {
      for (const f of ch.files) {
        if (`${ch.channel}/${f.name}` === activeFile) return f.content;
      }
    }
    return "";
  }, [channels, brief, activeFile]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Run</h1>
        </div>
        <Link
          to="/dashboard"
          className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
        >
          ← Dashboard
        </Link>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading run">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}
      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {loadError}
        </p>
      )}

      {run && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={run.status} />
            <span className="text-muted-foreground">
              started {new Date(run.created_at).toLocaleString()}
            </span>
            {isPacketWorkflowRun(run) && run.piece_id && (
              <Link
                to="/project/$pieceId"
                params={{ pieceId: run.piece_id }}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Open the project →
              </Link>
            )}
          </div>

          <RunDetailPanel run={run} />

          <RunCostCard runId={run.id} sessionId={run.session_id} runCostUsd={run.total_cost_usd} />

          {ACTIVE_RUN_STATUSES.includes(run.status) && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              <p>{activeStatusMessage(run.status, run.kind)}</p>
              <ElapsedIndicator since={run.created_at} />
            </div>
          )}

          {run.kind === "research" && run.status === "completed" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              Research complete.{" "}
              {nextRunId ? (
                isPacketWorkflow(run) ? (
                  <>
                    The packet is now being prepared from this report —{" "}
                    <Link
                      to="/runs/$runId"
                      params={{ runId: nextRunId }}
                      className="font-medium underline"
                    >
                      follow the packet run →
                    </Link>
                  </>
                ) : (
                  <>
                    Your draft is now being prepared from this report in your voice —{" "}
                    <Link
                      to="/runs/$runId"
                      params={{ runId: nextRunId }}
                      className="font-medium underline"
                    >
                      follow the drafting run →
                    </Link>
                  </>
                )
              ) : isPacketWorkflow(run) ? (
                "The packet run is being prepared; it will appear on your dashboard shortly."
              ) : (
                "The drafting run is being prepared; it will appear on your dashboard shortly."
              )}
            </div>
          )}

          {run.kind === "packet" && run.status === "completed" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              Research packet ready.{" "}
              <Link
                to="/packet/$runId"
                params={{ runId: run.id }}
                className="font-medium underline"
              >
                Review the questions →
              </Link>{" "}
              then print it with real writing space and answer by hand.
              {run.piece_id && (
                <>
                  {" "}
                  Track the whole journey from{" "}
                  <Link
                    to="/project/$pieceId"
                    params={{ pieceId: run.piece_id }}
                    className="font-medium underline"
                  >
                    your project page
                  </Link>
                  .
                </>
              )}
            </div>
          )}

          {(run.kind === "final_docx" || run.kind === "final_pptx") &&
            run.status === "completed" && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
                Your final {run.kind === "final_docx" ? "document" : "presentation"} is ready.{" "}
                {run.piece_id && (
                  <Link
                    to="/project/$pieceId"
                    params={{ pieceId: run.piece_id }}
                    className="font-medium underline"
                  >
                    Download it from your project page →
                  </Link>
                )}
              </div>
            )}

          {run.kind === "followup_research" && run.status === "completed" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              Follow-up research complete — your questions were answered and a revised packet was
              prepared (your original packet is unchanged).{" "}
              {run.piece_id && (
                <Link
                  to="/project/$pieceId"
                  params={{ pieceId: run.piece_id }}
                  className="font-medium underline"
                >
                  See the revised packet on your project page →
                </Link>
              )}
            </div>
          )}

          {(run.status === "failed" || run.status === "cancelled") && (
            <FailureBanner status={run.status} error={run.error} />
          )}

          {run.status === "completed" && (channels.length > 0 || brief) && (
            <section className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {brief && (
                  <TabButton
                    label="brief.md (generated)"
                    active={activeFile === BRIEF_TAB}
                    onClick={() => setActiveFile(BRIEF_TAB)}
                  />
                )}
                {channels.flatMap((ch) =>
                  ch.files.map((f) => {
                    const id = `${ch.channel}/${f.name}`;
                    return (
                      <TabButton
                        key={id}
                        label={id}
                        active={activeFile === id}
                        onClick={() => setActiveFile(id)}
                      />
                    );
                  }),
                )}
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                {activeFile === BRIEF_TAB || activeFile?.endsWith(".md") ? (
                  <MarkdownView source={activeContent} />
                ) : (
                  <pre className="whitespace-pre-wrap text-xs">{activeContent}</pre>
                )}
              </div>
            </section>
          )}

          {run.status === "completed" && channels.length === 0 && !brief && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              The run completed but produced no readable output.
            </div>
          )}

          {/* Draft-workflow next-step actions; research runs chain on their
              own and packet-workflow runs route through the project hub. */}
          {run.status === "completed" &&
            run.piece_id &&
            run.kind !== "research" &&
            !isPacketWorkflowRun(run) && <ActionsPanel run={run} />}
        </>
      )}
    </div>
  );
}

// Next-step actions after a completed run (plan v2 §product experience).
// Which actions make sense depends on what this run produced.
function ActionsPanel({ run }: { run: AgentRun }) {
  const router = useRouter();
  const { fromRevision } = Route.useSearch();
  const act = useServerFn(runPieceAction);
  const [feedback, setFeedback] = useState("");
  const [transcript, setTranscript] = useState("");
  const [pending, setPending] = useState<PieceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { balance } = useCreditBalance();
  // Prices come from the CREDIT_COST mirror (kept in sync with the server's
  // supabase/functions/_shared/credits.ts) so this paywall can't drift if an
  // action's cost changes.
  const cannotAfford = (action: PieceAction) => balance !== null && balance < CREDIT_COST[action];

  const isProposal = run.kind === "proposal" || run.kind === "resynth";
  const isDraft = run.kind === "draft";
  const outOfCredits = isDraft
    ? cannotAfford("revise")
    : cannotAfford("ready") && cannotAfford("resynth");

  // Dictation: transcribed text is appended to the annotation transcript
  // (never overwritten) so the user can dictate in passes and still hand-edit.
  const {
    recording,
    transcribing,
    error: dictationError,
    lastBlob,
    start: startDictation,
    stop: stopDictation,
    retry: retryDictation,
  } = useDictation(
    (text) => {
      setTranscript((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n${text}` : text));
    },
    { runId: run.id },
  );

  // Elapsed timer while recording, purely presentational.
  const [recordingSecs, setRecordingSecs] = useState(0);
  useEffect(() => {
    if (!recording) {
      setRecordingSecs(0);
      return;
    }
    setRecordingSecs(0);
    const started = Date.now();
    const t = window.setInterval(() => {
      setRecordingSecs(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(t);
  }, [recording]);

  // "Not quite" CTA on a revision run navigates back here with
  // ?fromRevision=<runId>. Scroll to the dictation panel and show a hint.
  const dictationPanelRef = useRef<HTMLDivElement | null>(null);
  const fromRevisionHint = isDraft && Boolean(fromRevision);
  useEffect(() => {
    if (!isDraft || !fromRevision) return;
    dictationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isDraft, fromRevision]);

  async function dispatch(action: PieceAction) {
    if (!run.piece_id || pending) return;
    setPending(action);
    setError(null);
    try {
      const { runId } = await act({
        data: {
          pieceId: run.piece_id,
          action,
          feedback: action === "revise" ? transcript : feedback,
          requestId: crypto.randomUUID(),
        },
      });
      router.navigate({ to: "/runs/$runId", params: { runId } });
      setPending(null);
      setFeedback("");
      setTranscript("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(
        isInsufficientCreditsError(message)
          ? "Not enough credits for this generation. You were not charged."
          : message,
      );
      setPending(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-serif text-xl">Next step</h2>

      {(isProposal || isDraft) && outOfCredits && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          You're out of credits.{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </p>
      )}

      {isProposal && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Happy with the proposal? <strong>Ready</strong> produces the final draft as a pull
            request you approve. Not quite? Say why and <strong>Resynth</strong> for a fresh
            attempt.
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="Optional steering: I'd cut the second section; lean harder on the case study; less formal…"
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => dispatch("ready")}
              disabled={pending !== null || cannotAfford("ready")}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {pending === "ready" ? "Starting…" : "Ready → final draft PR"}
            </button>
            <button
              type="button"
              onClick={() => dispatch("resynth")}
              disabled={pending !== null || cannotAfford("resynth")}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {pending === "resynth" ? "Starting…" : "Resynth"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each uses 1 credit — charged only when the generation finishes.
          </p>
        </div>
      )}

      {isDraft && (
        <div ref={dictationPanelRef} className="space-y-3">
          {fromRevisionHint && (
            <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              Dictate your annotations on that revision to produce the next version — the same
              transcript flow drives every pass.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            <Link
              to="/print/$runId"
              params={{ runId: run.id }}
              className="underline hover:text-foreground"
            >
              Print this draft
            </Link>
            , mark it up on paper, then <strong>dictate what you wrote</strong> — anchors like
            “S2P1” and marks like “mark three: cut”. <strong>Revise</strong> reconciles the
            transcript into the final version as a pull request.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={recording ? stopDictation : startDictation}
              disabled={transcribing || pending !== null}
              aria-pressed={recording}
              className={
                "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50 " +
                (recording
                  ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : "border-border bg-background hover:bg-muted")
              }
              title={recording ? "Stop and transcribe" : "Dictate your annotations"}
            >
              <span
                aria-hidden
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (recording ? "animate-pulse bg-destructive" : "bg-muted-foreground")
                }
              />
              {transcribing
                ? "Transcribing…"
                : recording
                  ? `Stop (${formatSecs(recordingSecs)})`
                  : "🎙 Dictate annotations"}
            </button>
            {recording && (
              <span className="text-xs text-muted-foreground">
                Speak freely — press Stop when done and the transcript will append below.
              </span>
            )}
          </div>

          {dictationError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <p className="font-medium">{dictationError.message}</p>
              {dictationError.hint && (
                <p className="mt-1 text-xs leading-relaxed text-destructive/85">
                  {dictationError.hint}
                </p>
              )}
              {dictationError.retryable && lastBlob && (
                <button
                  type="button"
                  onClick={retryDictation}
                  disabled={transcribing}
                  className="mt-2 inline-flex min-h-11 items-center rounded-md border border-destructive/50 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  {transcribing ? "Retrying…" : "Retry transcription"}
                </button>
              )}
            </div>
          )}

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder={
              "Press Dictate above, or type: \nS2P1: tighten to one sentence.\nMark three: cut everything after the comma."
            }
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 font-mono text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => dispatch("revise")}
            disabled={
              pending !== null || transcript.trim() === "" || cannotAfford("revise") || recording
            }
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
          >
            {pending === "revise" ? "Starting…" : "Revise → final PR"}
          </button>
          <p className="text-xs text-muted-foreground">
            Uses 1 credit — charged only when the generation finishes. Dictation itself uses
            workspace AI credits, separate from your generation credits.
          </p>
        </div>
      )}

      {run.kind === "revision" && <RevisionApprovalPanel pieceId={run.piece_id!} runId={run.id} />}

      <p className="text-xs text-muted-foreground">
        <Link
          to="/print/$runId"
          params={{ runId: run.id }}
          className="underline hover:text-foreground"
        >
          Print view
        </Link>{" "}
        · branch: <span className="font-mono">{run.branch ?? "—"}</span>
      </p>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function RevisionApprovalPanel({ pieceId, runId }: { pieceId: string; runId: string }) {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [mergedAt, setMergedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const approve = useServerFn(approveRevisionPr);
  const checkStatus = useServerFn(checkRevisionPrStatus);

  // Initial read + realtime subscription: the merge stamp lands here either
  // via the Approve button or via the passive status check that detects an
  // external merge on github.com.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("pieces")
      .select("final_pr_url, final_pr_merged_at")
      .eq("id", pieceId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as {
          final_pr_url: string | null;
          final_pr_merged_at: string | null;
        };
        setPrUrl((prev) => prev ?? row.final_pr_url);
        setMergedAt((prev) => prev ?? row.final_pr_merged_at);
      });

    const channel = supabase
      .channel(`piece-${pieceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pieces", filter: `id=eq.${pieceId}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as {
            final_pr_url: string | null;
            final_pr_merged_at: string | null;
          };
          if (row.final_pr_url) setPrUrl(row.final_pr_url);
          if (row.final_pr_merged_at) setMergedAt(row.final_pr_merged_at);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [pieceId]);

  // Passive status check hits GitHub for a merge stamp; runs on mount, on
  // tab refocus, and behind an explicit "Refresh status" link. Never fires
  // once we already have a merge timestamp.
  async function pollStatus(explicit: boolean) {
    if (mergedAt || pending) return;
    if (explicit) {
      setChecking(true);
      setError(null);
      setNote(null);
    }
    try {
      const res = await checkStatus({ data: { runId } });
      if (res.prUrl) setPrUrl(res.prUrl);
      if (res.alreadyMerged && res.mergedAt) {
        setMergedAt(res.mergedAt);
        setNote("The pull request was merged on GitHub.");
      } else if (explicit) {
        setNote("Not merged yet.");
      }
    } catch (err) {
      if (explicit) setError(err instanceof Error ? err.message : "Status check failed");
    } finally {
      if (explicit) setChecking(false);
    }
  }

  useEffect(() => {
    if (mergedAt) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) void pollStatus(false);
    }, 400);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollStatus(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, mergedAt]);

  async function onApprove() {
    if (pending) return;
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const res = await approve({ data: { runId } });
      if (res.prUrl) setPrUrl(res.prUrl);
      if (res.alreadyMerged) {
        setMergedAt((prev) => prev ?? new Date().toISOString());
        setNote("The pull request was already merged.");
      } else {
        setMergedAt(res.mergedAt ?? new Date().toISOString());
        setNote("Merged. The final version is now on the main branch.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setPending(false);
    }
  }

  // Find the piece's most recent completed draft run — its page hosts the
  // dictation panel that drives `revise`. Falls back to this revision if
  // there is none for some reason.
  async function onNotQuite() {
    const { data } = await supabase
      .from("agent_runs")
      .select("id")
      .eq("piece_id", pieceId)
      .eq("kind", "draft")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const targetRunId = (data as { id?: string } | null)?.id ?? runId;
    router.navigate({
      to: "/runs/$runId",
      params: { runId: targetRunId },
      search: { fromRevision: runId },
    });
  }

  if (mergedAt) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Approved and merged {new Date(mergedAt).toLocaleString()}. The final version is on the
          main branch — copy the piece from the tabs above wherever it's going.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Start a new piece →
          </Link>
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              View merged PR on GitHub ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Final version produced. Approve to squash-merge the pull request into <code>main</code>, or
        send it back and dictate another pass over the marked-up printout.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onApprove}
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Merging…" : "Approve & merge"}
        </button>
        <button
          type="button"
          onClick={onNotQuite}
          disabled={pending}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
        >
          Not quite — mark up & re-dictate
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Link to="/print/$runId" params={{ runId }} className="underline hover:text-foreground">
          Print this revision
        </Link>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            View PR on GitHub ↗
          </a>
        )}
        <button
          type="button"
          onClick={() => void pollStatus(true)}
          disabled={checking}
          className="underline hover:text-foreground disabled:opacity-50"
        >
          {checking ? "Checking…" : "Refresh status"}
        </button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function formatSecs(n: number): string {
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Ticking elapsed-time readout for in-flight runs — real observed time
 *  instead of a made-up duration estimate. */
function ElapsedIndicator({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const startMs = new Date(since).getTime();
  const secs = Number.isFinite(startMs) ? Math.max(0, Math.floor((now - startMs) / 1000)) : 0;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const elapsed = mins > 0 ? `${mins}m ${String(rem).padStart(2, "0")}s` : `${rem}s`;
  return (
    <p className="flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-emerald-500"
      />
      Working for <span className="font-mono text-foreground">{elapsed}</span>
    </p>
  );
}

/** Friendly failure/cancellation explanation; the raw error text lives in the
 *  technical-details disclosure below, never here. */
function FailureBanner({ status, error }: { status: string; error: string | null }) {
  const detail =
    status === "cancelled"
      ? { title: "This run was cancelled.", body: "" }
      : (interpretRunError(error) ?? {
          title: "The run didn't finish.",
          body: "",
        });
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      <p className="font-medium">{detail.title}</p>
      {detail.body && <p className="mt-1 text-destructive/90">{detail.body}</p>}
      <span className="mt-1 block text-xs text-muted-foreground">
        Any credit held for this run was released — you were not charged.
      </span>
    </div>
  );
}

/** A research run that will chain into a packet run (docs/research-workflow/). */
function isPacketWorkflow(run: AgentRun): boolean {
  return (
    !!run.input &&
    typeof run.input === "object" &&
    !Array.isArray(run.input) &&
    (run.input as Record<string, unknown>).workflow === "research_packet"
  );
}

function activeStatusMessage(status: RunStatus, kind: string): string {
  if (kind === "packet") {
    switch (status) {
      case "requested":
      case "dispatching":
        return "Starting — handing the packet build to the cloud agent.";
      case "dispatch_unknown":
        return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
      case "queued":
        return "Queued — the agent's workspace is being prepared.";
      case "running":
        return "Working — analyzing the research and writing questions tailored to its findings. This page updates live.";
      case "awaiting_fetch":
        return "Almost done — the packet is written; fetching it back and saving the questions for review.";
      default:
        return "In progress.";
    }
  }
  if (kind === "final_docx" || kind === "final_pptx") {
    const artifact = kind === "final_docx" ? "document" : "presentation";
    switch (status) {
      case "requested":
      case "dispatching":
        return `Starting — handing the final ${artifact} build to the cloud agent.`;
      case "dispatch_unknown":
        return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
      case "queued":
        return "Queued — the agent's workspace is being prepared.";
      case "running":
        return `Working — building the ${artifact} from the research and your verified words. This page updates live.`;
      case "awaiting_fetch":
        return `Almost done — the ${artifact} is built; saving it for download.`;
      default:
        return "In progress.";
    }
  }
  if (kind === "followup_research") {
    switch (status) {
      case "requested":
      case "dispatching":
        return "Starting — handing your approved follow-up questions to the research agent.";
      case "dispatch_unknown":
        return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
      case "queued":
        return "Queued — the agent's workspace is being prepared.";
      case "running":
        return "Researching your questions — seeking authoritative evidence and noting where it confirms or challenges the original findings. This page updates live.";
      case "awaiting_fetch":
        return "Almost done — the follow-up report is written; saving it as a revised packet.";
      default:
        return "In progress.";
    }
  }
  if (kind === "research") {
    switch (status) {
      case "requested":
      case "dispatching":
        return "Starting — submitting the topic for deep research.";
      case "dispatch_unknown":
        return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
      case "queued":
      case "running":
        return "Researching — scanning sources across the web and assembling a cited report. Deep research takes a while; the timer below shows how long it has been working. This page updates live.";
      case "awaiting_fetch":
        return "Almost done — the report is ready; fetching it and starting the drafting run.";
      default:
        return "In progress.";
    }
  }
  switch (status) {
    case "requested":
    case "dispatching":
      return "Starting — handing the run to the cloud agent.";
    case "dispatch_unknown":
      return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
    case "queued":
      return "Queued — the agent's workspace is being prepared.";
    case "running":
      return "Working — the agent is preparing the brief and writing the draft. This page updates live.";
    case "awaiting_fetch":
      return "Almost done — the draft is written; fetching it back now.";
    case "cancel_requested":
      return "Cancelling — waiting for the agent to confirm.";
    default:
      return "In progress.";
  }
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "rounded-md border px-3 py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:py-1.5 " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40")
      }
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: RunStatus }) {
  return <StatusPill status={status} />;
}

// -----------------------------------------------------------------------------
// Run detail panel — last error, status transitions, and timestamps.
// -----------------------------------------------------------------------------

type RunEvent = {
  id: string;
  event_type: string | null;
  source: string;
  received_at: string;
  payload: Json | null;
};

function RunDetailPanel({ run }: { run: AgentRun }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setEventsError(null);

    async function load() {
      const { data, error } = await supabase
        .from("agent_run_events")
        .select("id, event_type, source, received_at, payload")
        .eq("run_id", run.id)
        .order("received_at", { ascending: true })
        .limit(100);
      if (cancelled) return;
      if (error) setEventsError(error.message);
      else {
        const initial = (data ?? []) as RunEvent[];
        // Merge by id so a slow query cannot drop events that arrived via realtime.
        setEvents((prev) => {
          const byId = new Map<string, RunEvent>();
          for (const e of initial) byId.set(e.id, e);
          for (const e of prev) byId.set(e.id, e);
          return Array.from(byId.values()).sort((a, b) =>
            a.received_at.localeCompare(b.received_at),
          );
        });
      }
    }
    load();

    const channel = supabase
      .channel(`run-events-${run.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_run_events",
          filter: `run_id=eq.${run.id}`,
        },
        (payload) => {
          if (cancelled) return;
          const incoming = payload.new as RunEvent;
          setEvents((prev) =>
            prev.some((e) => e.id === incoming.id) ? prev : [...prev, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [run.id]);

  // Derive an ordered timeline of status transitions from the run row plus
  // the event stream. The run row alone gives the lifecycle bookends; events
  // give the intermediate provider-reported statuses.
  const timeline = useMemo(() => buildTimeline(run, events), [run, events]);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="font-serif text-lg">Run detail</h2>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Stat label="Started" value={formatTs(run.created_at)} />
        <Stat label="Completed" value={formatTs(run.completed_at)} />
        <Stat label="Duration" value={formatDuration(run)} />
      </dl>

      {/* Identifiers, raw errors, and the transition log matter to the site
          owner, not to students — collapsed by default (audit P1.1). */}
      <details className="group rounded-md border border-border/60 bg-background/40 px-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="inline-block transition-transform duration-150 group-open:rotate-90"
          >
            ▸
          </span>
          Technical details
        </summary>
        <div className="space-y-4 pb-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Stat label="Run ID" value={run.id} mono />
            <Stat label="Kind" value={run.kind} mono />
            <Stat label="Branch" value={run.branch ?? "—"} mono />
            <Stat label="Piece" value={run.piece_id ?? "—"} mono />
            <Stat label="Dispatched" value={formatTs(run.dispatched_at)} />
          </dl>

          {run.provider === "cursor" && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                Watch the raw agent stream on Cursor:
              </span>{" "}
              <a
                href={
                  run.external_agent_id
                    ? `https://cursor.com/agents?id=${encodeURIComponent(run.external_agent_id)}`
                    : "https://cursor.com/agents"
                }
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {run.external_agent_id
                  ? "Open this agent on cursor.com →"
                  : "Open cursor.com/agents →"}
              </a>
              {run.branch && (
                <span className="ml-1 text-muted-foreground">
                  (branch <span className="font-mono break-all">{run.branch}</span>)
                </span>
              )}
              <p className="mt-1 text-muted-foreground">
                Requires access to the site owner's Cursor workspace — the branch name is enough to
                locate the agent even without a deep link.
              </p>
            </div>
          )}

          {run.error && (
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Last error (raw)
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {run.error}
              </pre>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status transitions
            </div>
            <p className="text-xs text-muted-foreground">
              Each line is a real signal from the system — either the cloud agent pushed us an
              update (“from the agent”), our background checker polled and saw a change (“from our
              minute check”), or our controller changed the run itself (“from the app”).
            </p>
            {eventsError && (
              <p className="text-xs text-destructive">
                Could not load event history: {eventsError}
              </p>
            )}
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transitions recorded yet.</p>
            ) : (
              <ol className="space-y-1.5 border-l border-border pl-3">
                {timeline.map((entry, i) => (
                  <li key={`${entry.at}-${i}`} className="text-xs">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-muted-foreground">{formatTs(entry.at)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                        {entry.status}
                      </span>
                      {entry.source && (
                        <span
                          className="text-muted-foreground"
                          title={`raw source: ${entry.source}`}
                        >
                          {friendlySource(entry.source)}
                        </span>
                      )}
                    </div>
                    {entry.note && <div className="text-muted-foreground">{entry.note}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

/** Turn internal event-source names into plain English for the timeline. */
function friendlySource(source: string): string {
  switch (source) {
    case "reconciler":
      return "from our minute check";
    case "webhook":
      return "from the agent (push)";
    case "controller":
      return "from the app";
    case "edge":
      return "from the app";
    default:
      return `via ${source}`;
  }
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : "text-sm"}>{value}</dd>
    </div>
  );
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function formatDuration(run: AgentRun): string {
  const start = run.dispatched_at ?? run.created_at;
  const end = run.completed_at ?? (ACTIVE_RUN_STATUSES.includes(run.status) ? null : null);
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "—";
  const secs = Math.round((endMs - startMs) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

type TimelineEntry = { at: string; status: string; source: string; note?: string };

function buildTimeline(run: AgentRun, events: RunEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  entries.push({ at: run.created_at, status: "requested", source: "controller" });
  if (run.dispatched_at) {
    entries.push({ at: run.dispatched_at, status: "dispatched", source: "controller" });
  }

  for (const ev of events) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    const rawStatus = typeof payload.rawStatus === "string" ? payload.rawStatus : null;
    const message = typeof payload.message === "string" ? payload.message : null;

    // Poll / webhook events with a status change from the provider.
    if (rawStatus) {
      entries.push({
        at: ev.received_at,
        status: rawStatus.toLowerCase(),
        source: ev.source,
        note: ev.event_type && ev.event_type !== "polled" ? ev.event_type : undefined,
      });
      continue;
    }

    // Errors surface as their own timeline rows.
    if (ev.event_type && /error|failed|fetch_failed|reconcile_error/i.test(ev.event_type)) {
      entries.push({
        at: ev.received_at,
        status: ev.event_type,
        source: ev.source,
        note: message ?? undefined,
      });
    }
  }

  if (run.completed_at) {
    entries.push({
      at: run.completed_at,
      status: run.status,
      source: "controller",
      note: run.status === "failed" && run.error ? run.error : undefined,
    });
  }

  // Stable chronological order — repeated identical (at, status) pairs collapse.
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.at}|${e.status}|${e.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseResult(result: Json | null): {
  brief: GeneratedBrief | null;
  channels: OutputChannel[];
  nextRunId: string | null;
} {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { brief: null, channels: [], nextRunId: null };
  }
  const r = result as Record<string, unknown>;
  const nextRunId = typeof r.nextRunId === "string" ? r.nextRunId : null;

  let brief: GeneratedBrief | null = null;
  const rawBrief = r.brief;
  if (rawBrief && typeof rawBrief === "object" && !Array.isArray(rawBrief)) {
    const content = (rawBrief as Record<string, unknown>).content;
    const path = (rawBrief as Record<string, unknown>).path;
    if (typeof content === "string") {
      brief = { content, path: typeof path === "string" ? path : undefined };
    }
  }

  const channels: OutputChannel[] = [];
  if (Array.isArray(r.channels)) {
    for (const ch of r.channels as unknown[]) {
      if (!ch || typeof ch !== "object") continue;
      const channel = (ch as Record<string, unknown>).channel;
      const files = (ch as Record<string, unknown>).files;
      if (typeof channel !== "string" || !Array.isArray(files)) continue;
      const outFiles: OutputFile[] = [];
      for (const f of files as unknown[]) {
        if (!f || typeof f !== "object") continue;
        const name = (f as Record<string, unknown>).name;
        const content = (f as Record<string, unknown>).content;
        if (typeof name === "string" && typeof content === "string") {
          outFiles.push({ name, content });
        }
      }
      channels.push({ channel, files: outFiles });
    }
  }

  return { brief, channels, nextRunId };
}

function pickDefaultFile(channels: OutputChannel[], brief: GeneratedBrief | null): string | null {
  for (const ch of channels) {
    const post = ch.files.find((f) => f.name === "post.md") ?? ch.files[0];
    if (post) return `${ch.channel}/${post.name}`;
  }
  return brief ? BRIEF_TAB : null;
}
