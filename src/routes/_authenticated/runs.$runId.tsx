import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowRun } from "@/lib/workflows.functions";
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

function RunDetailPage() {
  const { runId } = Route.useParams();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("workflow_runs")
      .select(
        "id, user_id, status, workflow_type, input, result, error, created_at, started_at, completed_at",
      )
      .eq("id", runId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else if (!data) setLoadError("Run not found.");
        else setRun(data as WorkflowRun);
        setLoading(false);
      });

    // Live updates as the worker moves the run queued → running → succeeded.
    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workflow_runs", filter: `id=eq.${runId}` },
        (payload) => {
          if (!cancelled) setRun(payload.new as WorkflowRun);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [runId]);

  const { brief, channels } = useMemo(() => parseResult(run?.result ?? null), [run?.result]);

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

          {(run.status === "queued" || run.status === "running") && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              {run.status === "queued"
                ? "Queued — waiting for the worker to pick it up. (If WORKER_URL isn't configured on the edge function yet, it stays queued.)"
                : "Working — the agent is authoring the brief and synthesizing the piece. This page updates live."}
            </div>
          )}

          {run.status === "failed" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {run.error ?? "The run failed without an error message."}
            </div>
          )}

          {run.status === "succeeded" && (channels.length > 0 || brief) && (
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

          {run.status === "succeeded" && channels.length === 0 && !brief && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              The run succeeded but produced no readable output.
            </div>
          )}
        </>
      )}
    </div>
  );
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

function StatusBadge({ status }: { status: WorkflowRun["status"] }) {
  const tone: Record<WorkflowRun["status"], string> = {
    queued: "bg-muted text-muted-foreground",
    running: "bg-primary/15 text-primary",
    succeeded: "bg-emerald-500/15 text-emerald-600",
    failed: "bg-destructive/15 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone[status]}`}>{status}</span>
  );
}

function parseResult(result: Json | null): { brief: GeneratedBrief | null; channels: OutputChannel[] } {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { brief: null, channels: [] };
  }
  const r = result as Record<string, unknown>;

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

  return { brief, channels };
}

function pickDefaultFile(channels: OutputChannel[], brief: GeneratedBrief | null): string | null {
  for (const ch of channels) {
    const post = ch.files.find((f) => f.name === "post.md") ?? ch.files[0];
    if (post) return `${ch.channel}/${post.name}`;
  }
  return brief ? BRIEF_TAB : null;
}
