import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { startWorkflow } from "@/lib/workflows.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COST, isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";

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
  const [mode, setMode] = useState<"paste" | "topic">("paste");
  const [research, setResearch] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // requestId is the idempotency seed: stable for this form instance, so a
  // double-click or a retried request cannot dispatch two runs.
  const requestId = useMemo(() => crypto.randomUUID(), []);

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });
  const hasStyle = (profileData?.profile?.style_text ?? "").trim() !== "";

  const { balance } = useCreditBalance();
  const creditCost = mode === "topic" ? CREDIT_COST.research : CREDIT_COST.compose;
  const outOfCredits = balance !== null && balance < creditCost;

  const canSubmit =
    !submitting &&
    !profileLoading &&
    hasStyle &&
    !outOfCredits &&
    (mode === "topic" ? topic.trim() !== "" : research.trim() !== "" || files.length > 0);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
  const MAX_TOTAL_FILES = 10;

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const pickedArr = Array.from(picked);
    setFiles((prev) => {
      const next = [...prev];
      for (const f of pickedArr) {
        if (f.size > MAX_FILE_BYTES) continue;
        if (next.length >= MAX_TOTAL_FILES) break;
        if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f);
      }
      return next;
    });
    let nextError: string | null = null;
    let wouldAdd = 0;
    // Recompute validation against current `files` for the error message only;
    // the functional update above owns the actual list merge.
    let count = files.length;
    for (const f of pickedArr) {
      if (f.size > MAX_FILE_BYTES) {
        nextError = `${f.name} is larger than 20 MB.`;
        continue;
      }
      if (count >= MAX_TOTAL_FILES) {
        nextError = `Up to ${MAX_TOTAL_FILES} files per piece.`;
        break;
      }
      if (!files.find((x) => x.name === f.name && x.size === f.size)) {
        count += 1;
        wouldAdd += 1;
      }
    }
    if (nextError) setError(nextError);
    else if (wouldAdd > 0) setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "topic") {
        const { runId } = await start({
          data: { topic: topic.trim(), goal: goal.trim(), requestId },
        });
        router.navigate({ to: "/runs/$runId", params: { runId } });
        return;
      }

      // 1. Upload attachments (if any) to the private research-attachments
      //    bucket, scoped under the caller's own folder so RLS matches.
      const attachments: {
        path: string;
        name: string;
        contentType?: string;
        size?: number;
      }[] = [];
      if (files.length > 0) {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) throw new Error("Not signed in");
        const userId = userData.user.id;
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
          const safeName = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
          const path = `${userId}/${requestId}/${Date.now()}-${i}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("research-attachments")
            .upload(path, f, {
              cacheControl: "3600",
              upsert: false,
              contentType: f.type || undefined,
            });
          if (upErr) throw new Error(`Upload failed for ${f.name}: ${upErr.message}`);
          attachments.push({ path, name: f.name, contentType: f.type, size: f.size });
        }
        setUploadProgress(null);
      }

      const { runId } = await start({
        data: { research, goal: goal.trim(), requestId, attachments },
      });
      router.navigate({ to: "/runs/$runId", params: { runId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start";
      setError(
        isInsufficientCreditsError(message)
          ? "Not enough credits for this generation. You were not charged."
          : message,
      );
      setUploadProgress(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">New piece</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paste your research and hit Create. The studio authors a writing brief from the research
          in your voice — taken from{" "}
          <Link to="/profile" className="underline hover:text-foreground">
            your profile
          </Link>{" "}
          — then synthesizes the piece.
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

      {outOfCredits && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {mode === "topic"
            ? `A deep-research start uses ${CREDIT_COST.research} credits and you have ${balance}.`
            : "You're out of credits."}{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-7"
      >
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          role="tablist"
          aria-label="Research source"
        >
          <ModeButton
            label="I have research"
            active={mode === "paste"}
            onClick={() => setMode("paste")}
          />
          <ModeButton
            label="Research it for me"
            active={mode === "topic"}
            onClick={() => setMode("topic")}
          />
        </div>

        {mode === "topic" && (
          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Topic
            </span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              enterKeyHint="next"
              placeholder="What should we research? Be specific: the question, the angle, the timeframe, any actors to focus on."
              className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Deep web research runs first (usually 2–10 minutes, with sources cited), then the
              piece is composed from the report in your voice. The report is versioned with the
              piece.
            </p>
          </label>
        )}

        {mode === "paste" && (
          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Research
            </span>
            <textarea
              value={research}
              onChange={(e) => setResearch(e.target.value)}
              rows={10}
              enterKeyHint="next"
              placeholder="Paste notes, transcripts, links, a rough dump — whatever the piece is drawn from."
              className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 font-mono text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
            />
          </label>
        )}

        {mode === "paste" && (
          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Attachments{" "}
              <span className="normal-case tracking-normal text-muted-foreground/70">
                — optional, up to {MAX_TOTAL_FILES} · 20 MB each
              </span>
            </span>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
                id="attachments-input"
              />
              <label
                htmlFor="attachments-input"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-input bg-background/60 px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring/50"
              >
                + Add files
              </label>
              <p className="text-xs text-muted-foreground">
                Text (.txt/.md/.csv/.json/.html) is inlined into the research; other files are
                passed as signed URLs the agent can fetch.
              </p>
            </div>
            {files.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-background/40 text-sm">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(f.size / 1024).toFixed(1)} KB{f.type ? ` · ${f.type}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Goal{" "}
            <span className="normal-case tracking-normal text-muted-foreground/70">— optional</span>
          </span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="What should the reader walk away with?"
            className="w-full min-h-11 rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
        </label>

        {uploadProgress && (
          <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {uploadProgress}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Voice: {profileLoading ? "loading…" : hasStyle ? "from your profile" : "not set"}
            {" · "}
            Uses {creditCost} credit{creditCost === 1 ? "" : "s"}
            {balance !== null ? ` (you have ${balance})` : ""}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-busy={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 sm:w-auto"
          >
            {submitting
              ? uploadProgress
                ? "Uploading…"
                : "Creating…"
              : mode === "topic"
                ? "Research & create →"
                : "Create piece →"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeButton({
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
        "inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 " +
        (active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}
