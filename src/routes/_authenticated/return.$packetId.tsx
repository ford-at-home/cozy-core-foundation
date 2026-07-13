import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import { useDictation } from "@/hooks/use-dictation";
import {
  analyzeReturnedPage,
  createReturnUpload,
  submitDictation,
} from "@/lib/packet-return.functions";
import {
  deriveReturnUiStatus,
  getPacketById,
  listDictationSegments,
  listPageImages,
  listReturnsByPackets,
  type DictationSegment,
  type PageImage,
} from "@/lib/packet-workflow";
import { listPacketQuestions, type PacketQuestion } from "@/lib/packets";
import { Skeleton } from "@/components/ui/skeleton";

// Return your completed packet: photograph the pages (mobile-first camera
// capture), dictate responses, or both. Uploading, recognition, and review
// are free — credits attach to generation only.
//
// All writes go through Edge Functions (create-student-return-upload,
// analyze-returned-page, submit-dictation); this page only reads rows and
// signed URLs. Keyed by packet id: the return row itself is created
// server-side on the first upload or dictation.
export const Route = createFileRoute("/_authenticated/return/$packetId")({
  head: () => ({
    meta: [{ title: pageTitle("Return your work") }, { name: "robots", content: "noindex" }],
  }),
  component: ReturnPage,
});

const MAX_PAGE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 20;
const primaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40";

type QualityIssue = { code: string; message: string };

function ReturnPage() {
  const { packetId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const createUpload = useServerFn(createReturnUpload);
  const analyzePage = useServerFn(analyzeReturnedPage);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["return-by-packet", packetId],
    queryFn: async () => {
      const packet = await getPacketById(packetId);
      if (!packet) {
        return { packet: null, ret: null, pages: [], segments: [], questions: [] };
      }
      const [returns, questions] = await Promise.all([
        listReturnsByPackets([packetId]),
        listPacketQuestions(packetId),
      ]);
      const ret = returns[0] ?? null;
      const [pages, segments] = ret
        ? await Promise.all([listPageImages(ret.id), listDictationSegments(ret.id)])
        : [[] as PageImage[], [] as DictationSegment[]];
      return { packet, ret, pages, segments, questions };
    },
  });

  const packet = data?.packet ?? null;
  const ret = data?.ret ?? null;
  const pages = data?.pages ?? [];
  const segments = data?.segments ?? [];
  const questions = data?.questions ?? [];

  const uiStatus = ret
    ? deriveReturnUiStatus({
        returnStatus: ret.status,
        pages,
        segmentCount: segments.length,
        // The review page owns verification; while collecting, treat as not verified.
        hasVerification: false,
      })
    : "collecting";

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["return-by-packet", packetId] });

  async function addPhotos(picked: FileList | null) {
    if (!picked || !packet) return;
    setError(null);
    const files = Array.from(picked).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const tooBig = files.find((f) => f.size > MAX_PAGE_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is larger than 15 MB — most phone photos are well under that.`);
      return;
    }
    if (pages.length + files.length > MAX_PAGES) {
      setError(`A return holds up to ${MAX_PAGES} page photos.`);
      return;
    }
    try {
      setProgress(`Preparing ${files.length} upload${files.length === 1 ? "" : "s"}…`);
      const { uploads } = await createUpload({
        data: {
          packetId,
          returnId: ret?.id ?? null,
          pages: files.map((f) => ({ contentType: f.type || "image/jpeg" })),
        },
      });
      for (let i = 0; i < uploads.length; i++) {
        setProgress(`Uploading page photo ${i + 1} of ${uploads.length}…`);
        const { error: upErr } = await supabase.storage
          .from("packet-returns")
          .uploadToSignedUrl(uploads[i].storagePath, uploads[i].token, files[i], {
            contentType: files[i].type || "image/jpeg",
          });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      }
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function retakePage(page: PageImage, file: File) {
    if (!packet || !ret) return;
    setError(null);
    try {
      setProgress("Uploading the retake…");
      const { uploads } = await createUpload({
        data: {
          packetId,
          returnId: ret.id,
          pages: [{ pageNumber: page.page_number ?? undefined, contentType: file.type }],
        },
      });
      const u = uploads[0];
      const { error: upErr } = await supabase.storage
        .from("packet-returns")
        .uploadToSignedUrl(u.storagePath, u.token, file, {
          contentType: file.type || "image/jpeg",
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retake failed");
    } finally {
      setProgress(null);
    }
  }

  /** The return row is created lazily on the first photo or dictation. */
  async function ensureReturnId(): Promise<string> {
    if (ret) return ret.id;
    const { returnId } = await createUpload({ data: { packetId, pages: [] } });
    await invalidate();
    return returnId;
  }

  const pendingPages = pages.filter((p) => p.status === "uploaded");
  const failedPages = pages.filter((p) => p.status === "failed");
  const canSend = pendingPages.length > 0 || (pages.length === 0 && segments.length > 0);
  const readyForReview = ret && uiStatus === "needs_review";

  async function sendForReading() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      if (pendingPages.length > 0) {
        let readable = 0;
        for (let i = 0; i < pendingPages.length; i++) {
          setProgress(`Reading page photo ${i + 1} of ${pendingPages.length}…`);
          const result = await analyzePage({ data: { pageImageId: pendingPages[i].id } });
          const quality = (result as { quality?: { ok: boolean } }).quality;
          if (quality?.ok !== false) readable += 1;
        }
        setProgress(null);
        await invalidate();
        if (readable === pendingPages.length && failedPages.length === 0 && ret) {
          router.navigate({ to: "/review/$returnId", params: { returnId: ret.id } });
          return;
        }
        setError(
          "Some photos couldn't be read — each one below says why. Retake those pages and send again. Reading is free, so retries cost nothing.",
        );
      } else if (segments.length > 0 && ret) {
        // Dictation-only: nothing to recognize; straight to review.
        router.navigate({ to: "/review/$returnId", params: { returnId: ret.id } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send for reading");
    } finally {
      setProgress(null);
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Return your work</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Photograph each completed page — one page per photo, dark ink, good light, the whole
            page in frame — and/or dictate your answers. Returning and reading your work is free.
          </p>
        </div>
        {packet && (
          <Link
            to="/project/$pieceId"
            params={{ pieceId: packet.piece_id }}
            className="inline-flex min-h-11 shrink-0 items-center rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-0"
          >
            ← Back to project
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading return">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && !packet && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Packet not found. It may belong to another account.
        </div>
      )}

      {readyForReview && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          Your work has been read and is waiting for your review.{" "}
          <Link
            to="/review/$returnId"
            params={{ returnId: ret.id }}
            className="font-medium underline"
          >
            Review what was read →
          </Link>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {packet && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-2xl tracking-tight">Page photos</h2>
            <span className="text-xs text-muted-foreground">
              {pages.length} of {MAX_PAGES} page{pages.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Camera capture is the mobile-first path; the file picker covers desktop. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void addPhotos(e.target.files)}
              className="hidden"
              id="camera-input"
            />
            <label htmlFor="camera-input" className={primaryBtn + " cursor-pointer"}>
              Take a photo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => void addPhotos(e.target.files)}
              className="hidden"
              id="photos-input"
            />
            <label
              htmlFor="photos-input"
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md border border-input bg-background/60 px-4 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring/50 sm:w-auto"
            >
              Choose from library
            </label>
          </div>

          {progress && (
            <p
              aria-live="polite"
              className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground"
            >
              {progress}
            </p>
          )}

          {pages.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border bg-background/40">
              {pages.map((p, i) => (
                <PageRow key={p.id} page={p} index={i} onRetake={retakePage} />
              ))}
            </ul>
          )}
        </section>
      )}

      {packet && (
        <DictationSection
          packetId={packetId}
          questions={questions}
          segments={segments}
          ensureReturnId={ensureReturnId}
          onChanged={invalidate}
          onError={setError}
        />
      )}

      {packet && !readyForReview && (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Reading your work is free — no credits are used. You can leave and come back; nothing
            here is lost.
          </p>
          <button
            type="button"
            onClick={sendForReading}
            disabled={!canSend || sending || progress !== null}
            aria-busy={sending}
            className={primaryBtn}
          >
            {sending
              ? "Reading your pages…"
              : pendingPages.length > 0
                ? "Send for reading →"
                : "Continue to review →"}
          </button>
        </div>
      )}
    </div>
  );
}

function PageRow({
  page,
  index,
  onRetake,
}: {
  page: PageImage;
  index: number;
  onRetake: (page: PageImage, file: File) => Promise<void>;
}) {
  const retakeRef = useRef<HTMLInputElement>(null);
  const { data: url } = useQuery({
    queryKey: ["page-image-url", page.id, page.storage_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("packet-returns")
        .createSignedUrl(page.storage_path, 60 * 30);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    staleTime: 25 * 60 * 1000,
  });

  const failed = page.status === "failed";
  const issues = failed
    ? (((page.quality as { issues?: QualityIssue[] } | null)?.issues ?? []) as QualityIssue[])
    : [];

  return (
    <li className="flex gap-3 p-3">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
        {url && (
          <img
            src={url}
            alt={`Page photo ${index + 1}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">
            {page.page_number ? `Page ${page.page_number}` : `Photo ${index + 1}`}
          </span>
          <span
            className={
              "rounded-full border px-2 py-0.5 " +
              (page.status === "analyzed"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : failed
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : page.status === "analyzing"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border text-muted-foreground")
            }
          >
            {page.status === "analyzed"
              ? "read"
              : failed
                ? "needs a retake"
                : page.status === "analyzing"
                  ? "reading…"
                  : "ready to send"}
          </span>
        </div>
        {issues.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive">
            {issues.map((iss, j) => (
              <li key={j}>{iss.message}</li>
            ))}
          </ul>
        )}
        {failed && (
          <div>
            <input
              ref={retakeRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onRetake(page, f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => retakeRef.current?.click()}
              className={secondaryBtn}
            >
              Retake this page
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function DictationSection({
  packetId,
  questions,
  segments,
  ensureReturnId,
  onChanged,
  onError,
}: {
  packetId: string;
  questions: PacketQuestion[];
  segments: DictationSegment[];
  ensureReturnId: () => Promise<string>;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const submit = useServerFn(submitDictation);
  const [draft, setDraft] = useState("");
  const [questionId, setQuestionId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const dictation = useDictation((text) => {
    setDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${text}` : text));
  });

  async function saveSegment() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    onError(null);
    try {
      const returnId = await ensureReturnId();
      await submit({
        data: {
          packetId,
          returnId,
          transcript: text,
          resolvedTarget: questionId ? { questionId } : {},
          segmentOrder: (segments[segments.length - 1]?.segment_order ?? -1) + 1,
        },
      });
      setDraft("");
      setQuestionId("");
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 className="font-serif text-2xl tracking-tight">Dictate your answers</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Speak one answer at a time, review the transcript, tell us which question it answers, then
        save it. You can also type instead of speaking. Saved answers are corrected later, on the
        review screen.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={dictation.recording ? () => void dictation.stop() : () => void dictation.start()}
          disabled={dictation.transcribing}
          aria-pressed={dictation.recording}
          className={
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-50 " +
            (dictation.recording
              ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
              : "border-border bg-background hover:bg-muted")
          }
        >
          <span
            aria-hidden
            className={
              "h-1.5 w-1.5 rounded-full " +
              (dictation.recording ? "animate-pulse bg-destructive" : "bg-muted-foreground")
            }
          />
          {dictation.transcribing
            ? "Transcribing…"
            : dictation.recording
              ? "Stop recording"
              : "Dictate"}
        </button>
        {dictation.recording && (
          <p className="text-xs text-muted-foreground">
            Recording… speak one answer, then press Stop.
          </p>
        )}
      </div>

      {dictation.error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <p className="font-medium">{dictation.error.message}</p>
          {dictation.error.hint && (
            <p className="mt-1 text-xs leading-relaxed text-destructive/85">
              {dictation.error.hint}
            </p>
          )}
          {dictation.error.retryable && dictation.lastBlob && (
            <button
              type="button"
              onClick={dictation.retry}
              disabled={dictation.transcribing}
              className="mt-2 inline-flex min-h-11 items-center rounded-md border border-destructive/50 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {dictation.transcribing ? "Retrying…" : "Retry transcription"}
            </button>
          )}
        </div>
      )}

      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Transcript — review before saving
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Your spoken answer appears here for review. You can edit it, or type an answer directly."
          className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Which question does this answer?
        </span>
        <select
          value={questionId}
          onChange={(e) => setQuestionId(e.target.value)}
          className="min-h-11 w-full rounded-md border border-input bg-background/60 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
        >
          <option value="">Not tied to one question (general note)</option>
          {questions.map((q, i) => (
            <option key={q.id} value={q.id}>
              Q{i + 1} — {q.prompt.slice(0, 80)}
              {q.prompt.length > 80 ? "…" : ""}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={saveSegment}
        disabled={saving || draft.trim() === ""}
        className={primaryBtn}
      >
        {saving ? "Saving…" : "Save this answer"}
      </button>

      {segments.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border bg-background/40">
          {segments.map((s, i) => {
            const qid = (s.resolved_target as { questionId?: string } | null)?.questionId;
            const qIndex = qid ? questions.findIndex((q) => q.id === qid) : -1;
            return (
              <li key={s.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">#{i + 1}</span>
                  <span>{qIndex >= 0 ? `answers Q${qIndex + 1}` : "general note"}</span>
                </div>
                <p className="leading-relaxed">{s.transcript}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
