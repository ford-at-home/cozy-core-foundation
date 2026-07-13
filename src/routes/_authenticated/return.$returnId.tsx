import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import { useDictation } from "@/hooks/use-dictation";
import { recognizeReturn, type RecognizePageResult } from "@/lib/packet-return.functions";
import {
  addDictationSegment,
  deleteDictationSegment,
  deletePageImage,
  getReturn,
  listDictationSegments,
  listPageImages,
  markReturnNeedsReview,
  registerPageImage,
  updateDictationSegment,
  updatePageImage,
  updateReturnMethod,
  type DictationSegment,
  type PageImage,
  type PacketReturn,
} from "@/lib/packet-workflow";
import { listPacketQuestions, type PacketQuestion } from "@/lib/packets";
import { Skeleton } from "@/components/ui/skeleton";

// Return your completed packet: photograph the pages (mobile-first camera
// capture), dictate responses, or both. Uploading, recognition, and review
// are free — credits attach to generation only.
export const Route = createFileRoute("/_authenticated/return/$returnId")({
  head: () => ({
    meta: [{ title: pageTitle("Return your work") }, { name: "robots", content: "noindex" }],
  }),
  component: ReturnPage,
});

const MAX_PAGE_BYTES = 15 * 1024 * 1024;
const primaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40";

function ReturnPage() {
  const { returnId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const recognize = useServerFn(recognizeReturn);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pageFeedback, setPageFeedback] = useState<RecognizePageResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["return", returnId],
    queryFn: async () => {
      const ret = await getReturn(returnId);
      if (!ret) return { ret: null, pages: [], segments: [], questions: [] };
      const [pages, segments, questions] = await Promise.all([
        listPageImages(returnId),
        listDictationSegments(returnId),
        listPacketQuestions(ret.packet_id),
      ]);
      return { ret, pages, segments, questions };
    },
  });

  const ret = data?.ret ?? null;
  const pages = data?.pages ?? [];
  const segments = data?.segments ?? [];
  const questions = data?.questions ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["return", returnId] });

  async function addPhotos(picked: FileList | null) {
    if (!picked || !ret) return;
    setError(null);
    const files = Array.from(picked).filter((f) => f.type.startsWith("image/"));
    const tooBig = files.find((f) => f.size > MAX_PAGE_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is larger than 15 MB — most phone photos are well under that.`);
      return;
    }
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Not signed in");
      const userId = userData.user.id;
      let position = (pages[pages.length - 1]?.position ?? -1) + 1;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`Uploading page photo ${i + 1} of ${files.length}…`);
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${userId}/${returnId}/${Date.now()}-${i}.${ext || "jpg"}`;
        const { error: upErr } = await supabase.storage.from("packet-returns").upload(path, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type || "image/jpeg",
        });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        await registerPageImage({ returnId, storagePath: path, position });
        position += 1;
      }
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  async function movePage(page: PageImage, dir: -1 | 1) {
    const idx = pages.findIndex((p) => p.id === page.id);
    const other = pages[idx + dir];
    if (!other) return;
    setError(null);
    try {
      await Promise.all([
        updatePageImage(page.id, { position: other.position }),
        updatePageImage(other.id, { position: page.position }),
      ]);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reorder failed");
    }
  }

  async function removePage(page: PageImage) {
    setError(null);
    try {
      await deletePageImage(page);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  const hasPhotos = ret?.method === "photos" || ret?.method === "mixed";
  const hasDictation = ret?.method === "dictation" || ret?.method === "mixed";
  const unrecognizedPages = pages.filter((p) => p.status !== "recognized");
  const canSend = pages.length > 0 || segments.length > 0;

  async function sendForReading() {
    if (!ret || sending) return;
    setSending(true);
    setError(null);
    setPageFeedback([]);
    try {
      if (pages.length > 0) {
        const result = await recognize({ data: { returnId } });
        setPageFeedback(result.pages ?? []);
        await invalidate();
        if (result.status === "needs_review") {
          router.navigate({ to: "/review/$returnId", params: { returnId } });
          return;
        }
        setError(
          "The pages couldn't be read — see the notes on each photo below, retake them, and send again. You were not charged.",
        );
      } else {
        // Dictation-only: nothing to recognize; go straight to review.
        await markReturnNeedsReview(returnId);
        router.navigate({ to: "/review/$returnId", params: { returnId } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send for reading");
    } finally {
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
        {ret && (
          <Link
            to="/project/$pieceId"
            params={{ pieceId: ret.piece_id }}
            className="inline-flex min-h-11 shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm sm:min-h-0"
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

      {!isLoading && !ret && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Return not found. It may belong to another account.
        </div>
      )}

      {ret && (ret.status === "needs_review" || ret.status === "verified") && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {ret.status === "verified"
            ? "This return is verified."
            : "Your work has been read and is waiting for your review."}{" "}
          <Link to="/review/$returnId" params={{ returnId }} className="font-medium underline">
            {ret.status === "verified" ? "See the verified set →" : "Review what was read →"}
          </Link>
        </div>
      )}

      {ret && ret.status === "recognizing" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Your pages are being read — this takes a minute or two. This page updates when it's
          done.
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

      {ret && hasPhotos && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-2xl tracking-tight">Page photos</h2>
            <span className="text-xs text-muted-foreground">
              {pages.length} page{pages.length === 1 ? "" : "s"}
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

          {uploadProgress && (
            <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              {uploadProgress}
            </p>
          )}

          {pages.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border bg-background/40">
              {pages.map((p, i) => (
                <PageRow
                  key={p.id}
                  page={p}
                  index={i}
                  count={pages.length}
                  feedback={pageFeedback.find((f) => f.pageImageId === p.id)}
                  onMove={movePage}
                  onRemove={removePage}
                  onPageNumber={async (n) => {
                    try {
                      await updatePageImage(p.id, { page_number: n });
                      await invalidate();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Update failed");
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {ret && hasDictation && (
        <DictationSection
          returnId={returnId}
          questions={questions}
          segments={segments}
          onChanged={invalidate}
          onError={setError}
        />
      )}

      {ret && ret.status === "collecting" && (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Reading your work is free — no credits are used.</p>
            {ret.method !== "mixed" && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateReturnMethod(returnId, "mixed");
                    await invalidate();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Update failed");
                  }
                }}
                className="underline hover:text-foreground"
              >
                {ret.method === "photos" ? "Add dictation too" : "Add page photos too"}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={sendForReading}
            disabled={!canSend || sending || uploadProgress !== null}
            aria-busy={sending}
            className={primaryBtn}
          >
            {sending
              ? "Reading your pages…"
              : pages.length > 0
                ? unrecognizedPages.length === 0
                  ? "Continue to review →"
                  : "Send for reading →"
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
  count,
  feedback,
  onMove,
  onRemove,
  onPageNumber,
}: {
  page: PageImage;
  index: number;
  count: number;
  feedback?: RecognizePageResult;
  onMove: (page: PageImage, dir: -1 | 1) => Promise<void>;
  onRemove: (page: PageImage) => Promise<void>;
  onPageNumber: (n: number | null) => Promise<void>;
}) {
  const { data: url } = useQuery({
    queryKey: ["page-image-url", page.id],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("packet-returns")
        .createSignedUrl(page.storage_path, 60 * 30);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    staleTime: 25 * 60 * 1000,
  });

  const issues = feedback?.issues ?? page.quality?.issues ?? [];
  const rejected = page.status === "rejected" || page.status === "failed";

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
          <span className="font-medium">Photo {index + 1}</span>
          <span
            className={
              "rounded-full border px-2 py-0.5 " +
              (page.status === "recognized"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : rejected
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground")
            }
          >
            {page.status === "recognized"
              ? "read"
              : rejected
                ? "needs a retake"
                : "ready to send"}
          </span>
        </div>
        {issues.length > 0 && rejected && (
          <ul className="space-y-0.5 text-xs text-destructive">
            {issues.map((iss, j) => (
              <li key={j}>{iss.message}</li>
            ))}
          </ul>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Packet page #
          <input
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={page.page_number ?? ""}
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v !== page.page_number) void onPageNumber(v);
            }}
            className="w-16 min-h-9 rounded-md border border-input bg-background/60 px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-xs"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void onMove(page, -1)}
            disabled={index === 0}
            className={secondaryBtn}
            aria-label={`Move photo ${index + 1} earlier`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => void onMove(page, 1)}
            disabled={index === count - 1}
            className={secondaryBtn}
            aria-label={`Move photo ${index + 1} later`}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => void onRemove(page)}
            className={secondaryBtn + " text-muted-foreground hover:text-destructive"}
          >
            {rejected ? "Remove & retake" : "Remove"}
          </button>
        </div>
      </div>
    </li>
  );
}

function DictationSection({
  returnId,
  questions,
  segments,
  onChanged,
  onError,
}: {
  returnId: string;
  questions: PacketQuestion[];
  segments: DictationSegment[];
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
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
      await addDictationSegment({
        returnId,
        transcript: text,
        position: (segments[segments.length - 1]?.position ?? -1) + 1,
        linkedQuestionId: questionId || null,
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
        save it. You can also type instead of speaking.
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
          className="w-full min-h-11 rounded-md border border-input bg-background/60 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
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
          {segments.map((s, i) => (
            <SegmentRow
              key={s.id}
              segment={s}
              index={i}
              questions={questions}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SegmentRow({
  segment,
  index,
  questions,
  onChanged,
  onError,
}: {
  segment: DictationSegment;
  index: number;
  questions: PacketQuestion[];
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.transcript);
  const qIndex = questions.findIndex((q) => q.id === segment.linked_question_id);

  async function save() {
    onError(null);
    try {
      await updateDictationSegment(segment.id, { transcript: draft.trim() });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove() {
    onError(null);
    try {
      await deleteDictationSegment(segment.id);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">#{index + 1}</span>
        <span>{qIndex >= 0 ? `answers Q${qIndex + 1}` : "general note"}</span>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={draft.trim() === ""}
              className={secondaryBtn}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(segment.transcript);
                setEditing(false);
              }}
              className={secondaryBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="leading-relaxed">{segment.transcript}</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setEditing(true)} className={secondaryBtn}>
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              className={secondaryBtn + " text-muted-foreground hover:text-destructive"}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </li>
  );
}
