import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_RUN_STATUSES, type AgentRun, type RunStatus } from "@/lib/workflows.functions";
import { runPieceAction, type PieceAction } from "@/lib/pieces.functions";
import { isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";
import type { Json } from "@/integrations/supabase/types";
import MarkdownView from "@/components/MarkdownView";
import { RunCostCard } from "@/components/RunCostCard";
import { StatusPill } from "@/components/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Run") }, { name: "robots", content: "noindex" }],
  }),
  component: RunDetailPage,
});

// Result shape written by the worker, mirrored from the studio compose flow.
type OutputFile = { name: string; content: string };
type OutputChannel = { channel: string; files: OutputFile[] };
type GeneratedBrief = { path?: string; content: string };
const BRIEF_TAB = "__brief__";

const RUN_COLUMNS =
  "id, user_id, piece_id, session_id, provider, total_cost_usd, status, kind, input, result, error, branch, created_at, dispatched_at, completed_at";

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
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={runId}>
            {runId}
          </p>
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
          </div>

          <RunDetailPanel run={run} />

          <RunCostCard runId={run.id} sessionId={run.session_id} runCostUsd={run.total_cost_usd} />

          {ACTIVE_RUN_STATUSES.includes(run.status) && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {activeStatusMessage(run.status, run.kind)}
            </div>
          )}

          {run.kind === "research" && run.status === "completed" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              Research complete.{" "}
              {nextRunId ? (
                <>
                  The piece is now being composed from this report in your voice —{" "}
                  <Link
                    to="/runs/$runId"
                    params={{ runId: nextRunId }}
                    className="font-medium underline"
                  >
                    follow the compose run →
                  </Link>
                </>
              ) : (
                "The compose run is being prepared; it will appear on your dashboard within a couple of minutes."
              )}
            </div>
          )}

          {(run.status === "failed" || run.status === "cancelled") && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {run.status === "cancelled"
                ? "This run was cancelled."
                : (run.error ?? "The run failed without an error message.")}
              <span className="mt-1 block text-xs text-muted-foreground">
                Any credit held for this run was released — you were not charged.
              </span>
            </div>
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

          {run.status === "completed" && run.piece_id && run.kind !== "research" && (
            <ActionsPanel run={run} />
          )}
        </>
      )}
    </div>
  );
}

// Next-step actions after a completed run (plan v2 §product experience).
// Which actions make sense depends on what this run produced.
function ActionsPanel({ run }: { run: AgentRun }) {
  const router = useRouter();
  const act = useServerFn(runPieceAction);
  const [feedback, setFeedback] = useState("");
  const [transcript, setTranscript] = useState("");
  const [pending, setPending] = useState<PieceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { balance } = useCreditBalance();
  const outOfCredits = balance !== null && balance < 1;

  const isProposal = run.kind === "proposal" || run.kind === "resynth";
  const isDraft = run.kind === "draft";

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
              disabled={pending !== null || outOfCredits}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {pending === "ready" ? "Starting…" : "Ready → final draft PR"}
            </button>
            <button
              type="button"
              onClick={() => dispatch("resynth")}
              disabled={pending !== null || outOfCredits}
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
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <Link
              to="/print/$runId"
              params={{ runId: run.id }}
              className="underline hover:text-foreground"
            >
              Print this draft
            </Link>{" "}
            for pen markup, then return your annotations here (block anchors like “S4P3: tighten”,
            marks like “mark three: cut”). <strong>Revise</strong> reconciles them into the final
            version as a pull request.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder={
              "S2P1: tighten to one sentence.\nMark three: cut everything after the comma.\nThe viz on page 2: sketch of the handoff gap."
            }
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 font-mono text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => dispatch("revise")}
            disabled={pending !== null || transcript.trim() === "" || outOfCredits}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
          >
            {pending === "revise" ? "Starting…" : "Revise → final PR"}
          </button>
          <p className="text-xs text-muted-foreground">
            Uses 1 credit — charged only when the generation finishes.
          </p>
        </div>
      )}

      {run.kind === "revision" && (
        <p className="text-sm text-muted-foreground">
          Final version produced. Approve its pull request on GitHub, then copy the piece from the
          tabs above wherever it's going.
        </p>
      )}

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

function activeStatusMessage(status: RunStatus, kind: string): string {
  if (kind === "research") {
    switch (status) {
      case "requested":
      case "dispatching":
        return "Starting — submitting the topic for deep research.";
      case "dispatch_unknown":
        return "Starting… — dispatch is unconfirmed; the reconciler is resolving it. This page updates live.";
      case "queued":
      case "running":
        return "Researching — scanning sources across the web and assembling a cited report. Deep research usually takes 2–10 minutes. This page updates live.";
      case "awaiting_fetch":
        return "Almost done — the report is ready; fetching it and starting the compose run.";
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
      return "Working — the agent is preparing the brief and drafting the piece. This page updates live.";
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
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg">Run detail</h2>
        <span className="text-xs text-muted-foreground">kind: {run.kind}</span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Stat label="Created" value={formatTs(run.created_at)} />
        <Stat label="Dispatched" value={formatTs(run.dispatched_at)} />
        <Stat label="Completed" value={formatTs(run.completed_at)} />
        <Stat label="Duration" value={formatDuration(run)} />
        <Stat label="Branch" value={run.branch ?? "—"} mono />
        <Stat label="Piece" value={run.piece_id ?? "—"} mono />
      </dl>

      {run.error && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Last error
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
        {eventsError && (
          <p className="text-xs text-destructive">Could not load event history: {eventsError}</p>
        )}
        {timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">No transitions recorded yet.</p>
        ) : (
          <ol className="space-y-1.5 border-l border-border pl-3">
            {timeline.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="text-xs">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-muted-foreground">{formatTs(entry.at)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{entry.status}</span>
                  {entry.source && (
                    <span className="text-muted-foreground">via {entry.source}</span>
                  )}
                </div>
                {entry.note && <div className="text-muted-foreground">{entry.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
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
