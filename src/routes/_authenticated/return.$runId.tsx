import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand, pageTitle } from "@/config/brand";
import { getPacketByRunId, type Packet } from "@/lib/packets";
import {
  deleteDictationSegment,
  deletePageImage,
  ensureReturn,
  addDictation,
  listDictationSegments,
  listPageImages,
  uploadAndReadPage,
  type DictationSegment,
  type PacketReturn,
  type PageImage,
} from "@/lib/returns";
import { describeTarget } from "@/lib/return-mapping";
import { useDictation } from "@/hooks/use-dictation";
import { Skeleton } from "@/components/ui/skeleton";

// Return the completed packet: photograph pages, dictate answers, or both.
// Free — uploading and reading pages never consume credits. The next stage
// (verification) is gated on at least one readable page or one dictation.
export const Route = createFileRoute("/_authenticated/return/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Return your work") }, { name: "robots", content: "noindex" }],
  }),
  component: ReturnPage,
});

function ReturnPage() {
  const { runId } = Route.useParams();
  const [packet, setPacket] = useState<Packet | null>(null);
  const [ret, setRet] = useState<PacketReturn | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [segments, setSegments] = useState<DictationSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (returnId: string) => {
    const [p, s] = await Promise.all([listPageImages(returnId), listDictationSegments(returnId)]);
    setPages(p);
    setSegments(s);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await getPacketByRunId(runId);
        if (!alive) return;
        setPacket(p);
        if (p) {
          const r = await ensureReturn(p.id);
          if (!alive) return;
          setRet(r);
          await reload(r.id);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [runId, reload]);

  const readablePages = pages.filter((p) => p.status === "recognized").length;
  const hasWork = readablePages > 0 || segments.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Return your work</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Bring back what you wrote on paper. Photograph your completed pages, dictate your
            answers out loud, or do both — dictation is a good backup for anything hard to read.
            Returning your work is free.
          </p>
        </div>
        <Link
          to="/runs/$runId"
          params={{ runId }}
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm sm:min-h-0"
        >
          ← Back
        </Link>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {!loading && !error && !packet && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          There's no packet for this run yet, so there's nothing to return. If the packet just
          finished, give it a moment and reload.
        </div>
      )}

      {!loading && packet && ret && (
        <>
          {ret.status === "verified" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              You've already reviewed this return. Anything you add here will need another review.
            </div>
          )}

          <PhotoPanel
            packetId={packet.id}
            pages={pages}
            onChanged={() => reload(ret.id)}
            onError={setError}
          />

          <DictationPanel
            returnId={ret.id}
            segments={segments}
            onChanged={() => reload(ret.id)}
            onError={setError}
          />

          <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-md text-xs text-muted-foreground">
              {hasWork
                ? "We've read your notes, but handwriting can be ambiguous. Check the reading before it's used for anything else."
                : "Add at least one readable page or one dictation to continue."}
            </p>
            {hasWork ? (
              <Link
                to="/verify/$runId"
                params={{ runId }}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
              >
                Check what we read →
              </Link>
            ) : (
              <span className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-muted px-5 text-sm font-medium text-muted-foreground sm:w-auto">
                Check what we read →
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PhotoPanel({
  packetId,
  pages,
  onChanged,
  onError,
}: {
  packetId: string;
  pages: PageImage[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    onError(null);
    const newNotices: string[] = [];
    try {
      const list = Array.from(files);
      for (let i = 0; i < list.length; i++) {
        setProgress(
          list.length > 1 ? `Reading page ${i + 1} of ${list.length}…` : "Reading your page…",
        );
        try {
          const res = await uploadAndReadPage(packetId, list[i]);
          if (res.status === "rejected" && res.retakeMessage) {
            newNotices.push(res.retakeMessage);
          }
        } catch (err) {
          newNotices.push(
            err instanceof Error ? err.message : "One photo failed to upload. Try it again.",
          );
        }
        await onChanged();
      }
    } finally {
      setNotices(newNotices);
      setProgress(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="font-serif text-xl">Photograph your pages</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          One page per photo works best: whole page in frame, no glare, page number visible. If a
          photo can't be read, we'll tell you exactly why so you can retake it.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        id="page-photos"
        onChange={(e) => void handleFiles(e.target.files)}
        disabled={busy}
      />
      <label
        htmlFor="page-photos"
        className={
          "inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto " +
          (busy ? "pointer-events-none opacity-50" : "")
        }
      >
        {busy
          ? (progress ?? "Reading…")
          : pages.length > 0
            ? "+ Add more pages"
            : "Add page photos"}
      </label>

      {notices.map((n, i) => (
        <p
          key={i}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {n}
        </p>
      ))}

      {pages.length > 0 && (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                {p.status === "recognized" && (
                  <>
                    <span className="font-medium">
                      {p.page_number ? `Page ${p.page_number}` : "Page"}
                    </span>
                    <span className="ml-2 text-xs text-emerald-400">read</span>
                  </>
                )}
                {p.status === "rejected" && (
                  <>
                    <span className="font-medium">Photo</span>
                    <span className="ml-2 text-xs text-amber-400">needs a retake</span>
                  </>
                )}
                {p.status === "reading" && (
                  <>
                    <span className="font-medium">Photo</span>
                    <span className="ml-2 text-xs text-muted-foreground">reading…</span>
                  </>
                )}
              </span>
              {p.status === "rejected" && (
                <button
                  type="button"
                  onClick={async () => {
                    onError(null);
                    try {
                      await deletePageImage(p);
                      await onChanged();
                    } catch (err) {
                      onError(err instanceof Error ? err.message : "Could not remove the photo");
                    }
                  }}
                  className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DictationPanel({
  returnId,
  segments,
  onChanged,
  onError,
}: {
  returnId: string;
  segments: DictationSegment[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const dictation = useDictation(async (text) => {
    setSaving(true);
    try {
      await addDictation(returnId, text);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the dictation");
    } finally {
      setSaving(false);
    }
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="font-serif text-xl">Dictate your answers</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Speak your answers and say where each one belongs — “Question 2: …”, “Page 3: …”, or
          “S4P3: …”. Use this instead of photos, or alongside them for anything hard to read.
        </p>
      </div>

      <button
        type="button"
        onClick={dictation.recording ? dictation.stop : dictation.start}
        disabled={dictation.transcribing || saving}
        className={
          "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-50 sm:w-auto " +
          (dictation.recording
            ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
            : "border-border bg-background hover:bg-muted")
        }
        aria-pressed={dictation.recording}
      >
        <span
          aria-hidden
          className={
            "h-2 w-2 rounded-full " +
            (dictation.recording ? "animate-pulse bg-destructive" : "bg-muted-foreground")
          }
        />
        {dictation.recording
          ? "Stop recording"
          : dictation.transcribing || saving
            ? "Transcribing…"
            : "Start dictating"}
      </button>

      {dictation.recording && (
        <p className="text-xs text-muted-foreground">
          Recording… speak freely, then press Stop. Say the question or page number before each
          answer.
        </p>
      )}

      {dictation.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{dictation.error.message}</p>
          {dictation.error.hint && (
            <p className="mt-1 text-xs opacity-80">{dictation.error.hint}</p>
          )}
          {dictation.error.retryable && dictation.lastBlob && (
            <button
              type="button"
              onClick={() => void dictation.retry()}
              disabled={dictation.transcribing}
              className="mt-2 inline-flex min-h-11 items-center rounded-md border border-destructive/50 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 sm:min-h-9"
            >
              {dictation.transcribing ? "Retrying…" : "Retry transcription"}
            </button>
          )}
        </div>
      )}

      {segments.length > 0 && (
        <ul className="space-y-2">
          {segments.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {describeTarget(s.resolved_target)}
                </p>
                <p className="mt-0.5 leading-relaxed">{s.transcript}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  onError(null);
                  try {
                    await deleteDictationSegment(s.id);
                    await onChanged();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Could not remove the segment");
                  }
                }}
                className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
