import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { startWorkflow } from "@/lib/workflows.functions";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await start({ data: { research, voice, goal } });
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New piece</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder form. The real composer UI will be migrated in here.
        </p>
      </div>

      {/* INSERT: composer UI from migrated app goes here. Keep the startWorkflow
          server-function call — do not call the edge function directly. */}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Research</span>
          <textarea
            value={research}
            onChange={(e) => setResearch(e.target.value)}
            rows={4}
            placeholder="Paste research here…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Voice</span>
          <input
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder="e.g. plainspoken"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Goal</span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. announcement"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Starting…" : "Start"}
        </button>
      </form>
    </div>
  );
}