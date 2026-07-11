import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { startWorkflow } from "@/lib/workflows.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

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

  const canSubmit =
    !submitting && !profileLoading && hasStyle && (research.trim() !== "" || files.length > 0);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
  const MAX_TOTAL_FILES = 10;

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const next: File[] = [...files];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} is larger than 20 MB.`);
        continue;
      }
      if (next.length >= MAX_TOTAL_FILES) {
        setError(`Up to ${MAX_TOTAL_FILES} files per piece.`);
        break;
      }
      if (!next.find((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    setFiles(next);
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
      setError(err instanceof Error ? err.message : "Failed to start");
      setUploadProgress(null);
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

        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Attachments <span className="normal-case tracking-normal text-muted-foreground/70">— optional, up to {MAX_TOTAL_FILES} · 20 MB each</span>
          </span>
          <div className="flex flex-wrap items-center gap-3">
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
              className="cursor-pointer rounded-md border border-input bg-background/60 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              + Add files
            </label>
            <p className="text-xs text-muted-foreground">
              Text (.txt/.md/.csv/.json/.html) is inlined into the research; other files are passed as signed URLs the agent can fetch.
            </p>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-background/40 text-sm">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(f.size / 1024).toFixed(1)} KB{f.type ? ` · ${f.type}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-3 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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

        {uploadProgress && (
          <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {uploadProgress}
          </p>
        )}

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
            {submitting ? (uploadProgress ? "Uploading…" : "Creating…") : "Create piece →"}
          </button>
        </div>
      </form>
    </div>
  );
}
