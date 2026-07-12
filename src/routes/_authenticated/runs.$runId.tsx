import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_RUN_STATUSES, type AgentRun, type RunStatus } from "@/lib/workflows.functions";
import { runPieceAction, type PieceAction } from "@/lib/pieces.functions";
import type { Json } from "@/integrations/supabase/types";
import MarkdownView from "@/components/MarkdownView";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({
    meta: [
      { title: "Run — Compose" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RunDetailPage,
});

// Result shape written by the worker, mirrored from the studio compose flow.
type OutputFile = { name: string; content: string };
type OutputChannel = { channel: string; files: OutputFile[] };
type GeneratedBrief = { path?: string; content: string };
const BRIEF_TAB = "__brief__";

const RUN_COLUMNS =
  "id, user_id, piece_id, status, kind, input, result, error, branch, created_at, dispatched_at, completed_at";

function RunDetailPage() {
  const { runId } = Route.useParams();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("id", runId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else if (!data) setLoadError("Run not found.");
        else setRun(data as AgentRun);
        setLoading(false);
      });

    // Live updates as the controller moves the run through the state machine.
    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
        (payload) => {
          if (!cancelled) setRun(payload.new as AgentRun);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Run</h1>
          <p className="font-mono text-xs text-muted-foreground">{runId}</p>
        </div>
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {run && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={run.status} />
            <span className="text-muted-foreground">
              started {new Date(run.created_at).toLocaleString()}
            </span>
          </div>

          <RunDetailPanel run={run} />

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
      setError(err instanceof Error ? err.message : "Action failed");
      setPending(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <h2 className="font-serif text-xl">Next step</h2>

      {isProposal && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Happy with the proposal? <strong>Ready</strong> produces the final draft as a
            pull request you approve. Not quite? Say why and <strong>Resynth</strong> for
            a fresh attempt.
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder="Optional steering: I'd cut the second section; lean harder on the case study; less formal…"
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => dispatch("ready")}
              disabled={pending !== null}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending === "ready" ? "Starting…" : "Ready → final draft PR"}
            </button>
            <button
              type="button"
              onClick={() => dispatch("resynth")}
              disabled={pending !== null}
              className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              {pending === "resynth" ? "Starting…" : "Resynth"}
            </button>
          </div>
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
            for pen markup, then type your annotations back here (block anchors like
            “S4P3: tighten”, marks like “mark three: cut”). <strong>Revise</strong>{" "}
            produces the final version as a pull request.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder={'S2P1: tighten to one sentence.\nMark three: cut everything after the comma.\nThe viz on page 2: sketch of the handoff gap.'}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 font-mono text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={() => dispatch("revise")}
            disabled={pending !== null || transcript.trim() === ""}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending === "revise" ? "Starting…" : "Revise → final PR"}
          </button>
        </div>
      )}

      {run.kind === "revision" && (
        <p className="text-sm text-muted-foreground">
          Final version produced. Approve its pull request on GitHub, then copy the piece
          from the tabs above wherever it's going.
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
      return "Working — the agent is authoring the brief and synthesizing the piece. This page updates live.";
    case "awaiting_fetch":
      return "Almost done — the piece is written; fetching it back now.";
    case "cancel_requested":
      return "Cancelling — waiting for the agent to confirm.";
    default:
      return "In progress.";
  }
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded border px-2 py-1 text-xs " +
        (active
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: RunStatus }) {
  const tone: Record<RunStatus, string> = {
    requested: "bg-muted text-muted-foreground",
    dispatching: "bg-muted text-muted-foreground",
    dispatch_unknown: "bg-amber-500/15 text-amber-600",
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    awaiting_fetch: "bg-primary/15 text-primary",
    completed: "bg-emerald-500/15 text-emerald-600",
    failed: "bg-destructive/15 text-destructive",
    cancel_requested: "bg-amber-500/15 text-amber-600",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone[status]}`}>{status}</span>
  );
}

function parseResult(
  result: Json | null,
): { brief: GeneratedBrief | null; channels: OutputChannel[]; nextRunId: string | null } {
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
