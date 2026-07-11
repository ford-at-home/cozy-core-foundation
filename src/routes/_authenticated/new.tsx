import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { startWorkflow } from "@/lib/workflows.functions";

// Migrated from packages/studio: paste research, pick a voice, and compose.
// The generation runs on the self-hosted worker (via the start-workflow edge
// function); this page only kicks off the run and hands off to the run detail.
const DEFAULT_BUNDLE = "voice-only";
const DEFAULT_MODEL = "composer-2.5";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({
    meta: [
      { title: "New piece — Compose" },
      { name: "description", content: "Start a new writing workflow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewPiecePage,
});

function NewPiecePage() {
  const router = useRouter();
  const start = useServerFn(startWorkflow);
  const [research, setResearch] = useState("");
  const [voice, setVoice] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !submitting && research.trim() !== "" && voice.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { runId } = await start({
        data: {
          research,
          voice: voice.trim(),
          goal: goal.trim(),
          bundle: DEFAULT_BUNDLE,
          model: DEFAULT_MODEL,
        },
      });
      router.navigate({ to: "/runs/$runId", params: { runId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">New piece</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paste your research, pick a voice, and hit Create. The studio authors a
          writing brief from the research in your voice, then synthesizes the piece.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-border bg-card p-7 text-card-foreground shadow-sm"
      >
        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Research
          </span>
          <textarea
            value={research}
            onChange={(e) => setResearch(e.target.value)}
            rows={12}
            placeholder="Paste notes, transcripts, links, a rough dump — whatever the piece is drawn from."
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 font-mono text-sm leading-relaxed outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Voice
            </span>
            <input
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="e.g. ford"
              className="w-full rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
            <span className="block text-xs text-muted-foreground">
              A voice defined on the worker (under <code className="font-mono text-[11px]">~/.me/voices/</code>).
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Goal <span className="normal-case tracking-normal text-muted-foreground/70">— optional</span>
            </span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the reader walk away with?"
              className="w-full rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border/60 pt-5">
          <p className="text-xs text-muted-foreground">
            {DEFAULT_BUNDLE} · {DEFAULT_MODEL}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create piece →"}
          </button>
        </div>
      </form>
    </div>
  );
}
