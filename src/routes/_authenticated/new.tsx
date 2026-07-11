import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { startWorkflow } from "@/lib/workflows.functions";
import { getMyProfile } from "@/lib/profile.functions";

// Composer: paste research, optionally steer with a goal, and compose.
// Voice is NOT an input here — it comes from the signed-in user's profile
// (style_text) and is resolved server-side at dispatch. The browser sends
// only safe inputs: research, goal, requestId.
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
  const fetchProfile = useServerFn(getMyProfile);
  const [research, setResearch] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // requestId is the idempotency seed: stable for this form instance, so a
  // double-click or a retried request cannot dispatch two runs.
  const requestId = useMemo(() => crypto.randomUUID(), []);

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });
  const hasStyle = (profileData?.profile?.style_text ?? "").trim() !== "";

  const canSubmit = !submitting && !profileLoading && hasStyle && research.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { runId } = await start({
        data: { research, goal: goal.trim(), requestId },
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
          Paste your research and hit Create. The studio authors a writing brief from the
          research in your voice — taken from{" "}
          <Link to="/profile" className="underline hover:text-foreground">
            your profile
          </Link>
          {" "}— then synthesizes the piece.
        </p>
      </div>

      {!profileLoading && !hasStyle && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Your voice profile is empty, and composing without a voice is refused by design.{" "}
          <Link to="/profile" className="font-medium underline">
            Describe your style first →
          </Link>
        </div>
      )}

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

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border/60 pt-5">
          <p className="text-xs text-muted-foreground">
            Voice: {profileLoading ? "loading…" : hasStyle ? "from your profile" : "not set"}
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
