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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New piece</h1>
        <p className="text-sm text-muted-foreground">
          Paste your research, pick a voice, and hit Create. The studio authors a
          writing brief from the research in your voice, then synthesizes the piece.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Research</span>
          <textarea
            value={research}
            onChange={(e) => setResearch(e.target.value)}
            rows={10}
            placeholder="Paste notes, transcripts, links, a rough dump — whatever the piece is drawn from."
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Voice</span>
            <input
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="e.g. ford"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              A voice defined on the worker (under <code>~/.me/voices/</code>).
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Goal <span className="font-normal text-muted-foreground">— optional</span>
            </span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the reader walk away with / who's it for?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </form>
    </div>
  );
}
