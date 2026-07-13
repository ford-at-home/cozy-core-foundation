import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { brand, pageTitle } from "@/config/brand";
import { getPacketByRunId, type Packet } from "@/lib/packets";
import {
  REVIEW_CONFIDENCE_THRESHOLD,
  getPageImageUrl,
  getReturnByPacketId,
  listCorrections,
  listDictationSegments,
  listPageImages,
  listRecognizedBlocks,
  removeCorrection,
  saveCorrection,
  updateHandwritingProfileFromCorrections,
  verifyReturn,
  type DictationSegment,
  type PacketReturn,
  type PageImage,
  type RecognizedBlock,
  type VerificationCorrection,
} from "@/lib/returns";
import { describeTarget } from "@/lib/return-mapping";
import { Skeleton } from "@/components/ui/skeleton";

// Mandatory verification (docs/research-workflow/04): before the student's
// returned work feeds anything else, they check what the system read.
// Machine readings are never presented as confirmed; low confidence is
// highlighted; corrections are separate rows so the original reading is
// preserved (provenance rule).
export const Route = createFileRoute("/_authenticated/verify/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Check the reading") }, { name: "robots", content: "noindex" }],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const [packet, setPacket] = useState<Packet | null>(null);
  const [ret, setRet] = useState<PacketReturn | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [blocks, setBlocks] = useState<RecognizedBlock[]>([]);
  const [segments, setSegments] = useState<DictationSegment[]>([]);
  const [corrections, setCorrections] = useState<VerificationCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const p = await getPacketByRunId(runId);
    setPacket(p);
    if (!p) return;
    const r = await getReturnByPacketId(p.id);
    setRet(r);
    if (!r) return;
    const [pg, bl, sg, co] = await Promise.all([
      listPageImages(r.id),
      listRecognizedBlocks(r.id),
      listDictationSegments(r.id),
      listCorrections(r.id),
    ]);
    setPages(pg);
    setBlocks(bl);
    setSegments(sg);
    setCorrections(co);
  }, [runId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  const correctionByBlock = useMemo(() => {
    const m = new Map<string, VerificationCorrection>();
    for (const c of corrections) if (c.block_id) m.set(c.block_id, c);
    return m;
  }, [corrections]);
  const correctionBySegment = useMemo(() => {
    const m = new Map<string, VerificationCorrection>();
    for (const c of corrections) if (c.segment_id) m.set(c.segment_id, c);
    return m;
  }, [corrections]);

  const lowConfidenceCount = blocks.filter(
    (b) => b.confidence < REVIEW_CONFIDENCE_THRESHOLD && !correctionByBlock.has(b.id),
  ).length;

  async function approve() {
    if (!ret || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Feed confirmed corrections into the consented handwriting profile
      // (no-op unless the student opted in on their Profile page).
      const pairs = corrections
        .filter((c) => c.block_id && c.corrected_text)
        .map((c) => ({
          original: blocks.find((b) => b.id === c.block_id)?.text ?? "",
          corrected: c.corrected_text ?? "",
        }));
      await updateHandwritingProfileFromCorrections(pairs).catch(() => {
        // Profile adaptation must never block verification.
      });
      await verifyReturn(ret.id);
      if (packet) {
        navigate({ to: "/projects/$pieceId", params: { pieceId: packet.piece_id } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review");
      setBusy(false);
    }
  }

  const verified = ret?.status === "verified";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">
            Check what we read
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This is what we read from your pages and dictation. Handwriting can be ambiguous, so
            nothing here counts until you confirm it. Fix anything we got wrong — your correction
            wins, always.
          </p>
        </div>
        <Link
          to="/return/$runId"
          params={{ runId }}
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm sm:min-h-0"
        >
          ← Add more
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

      {!loading && !error && (!packet || !ret) && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing to check yet — return your pages or dictate your answers first.
          <div className="mt-3">
            <Link
              to="/return/$runId"
              params={{ runId }}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Return your work →
            </Link>
          </div>
        </div>
      )}

      {!loading && ret && (
        <>
          {verified && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
              You confirmed this reading{ret.verified_at ? ` on ${new Date(ret.verified_at).toLocaleDateString()}` : ""}.
              You can still make corrections and confirm again.
            </div>
          )}

          {lowConfidenceCount > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              {lowConfidenceCount} passage{lowConfidenceCount === 1 ? "" : "s"} marked{" "}
              <span className="font-medium">Needs your check</span> — we weren't confident about
              the handwriting there. Read those first.
            </div>
          )}

          {pages
            .filter((p) => p.status === "recognized")
            .map((page) => (
              <PageSection
                key={page.id}
                page={page}
                blocks={blocks.filter((b) => b.page_image_id === page.id)}
                corrections={correctionByBlock}
                returnId={ret.id}
                onChanged={reload}
                onError={setError}
              />
            ))}

          {segments.length > 0 && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="font-serif text-xl">Your dictation</h2>
              <ul className="space-y-2">
                {segments.map((s) => (
                  <SegmentRow
                    key={s.id}
                    segment={s}
                    correction={correctionBySegment.get(s.id)}
                    returnId={ret.id}
                    onChanged={reload}
                    onError={setError}
                  />
                ))}
              </ul>
            </section>
          )}

          {blocks.length === 0 && segments.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              We didn't find any handwriting or dictation in this return yet.
            </div>
          )}

          {(blocks.length > 0 || segments.length > 0) && (
            <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-xs text-muted-foreground">
                Confirming uses no credits. After this, you can choose follow-up research or go
                straight to your final materials.
              </p>
              <button
                type="button"
                onClick={approve}
                disabled={busy}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Saving…" : verified ? "Confirm again →" : "This reading is right →"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PageSection({
  page,
  blocks,
  corrections,
  returnId,
  onChanged,
  onError,
}: {
  page: PageImage;
  blocks: RecognizedBlock[];
  corrections: Map<string, VerificationCorrection>;
  returnId: string;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    if (!showImage || imageUrl) return;
    let alive = true;
    getPageImageUrl(page.storage_path).then((url) => {
      if (alive) setImageUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [showImage, imageUrl, page.storage_path]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl">
          {page.page_number ? `Page ${page.page_number}` : "Page"}
        </h2>
        <button
          type="button"
          onClick={() => setShowImage((v) => !v)}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
        >
          {showImage ? "Hide photo" : "Show photo"}
        </button>
      </div>

      {showImage &&
        (imageUrl ? (
          <img
            src={imageUrl}
            alt={`Your photo of ${page.page_number ? `page ${page.page_number}` : "this page"}`}
            className="max-h-[70vh] w-full rounded-md border border-border/60 object-contain"
          />
        ) : (
          <Skeleton className="h-48 w-full rounded-md" />
        ))}

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          We didn't find handwriting on this page. If you wrote here, retake the photo or dictate
          the answers instead.
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              correction={corrections.get(b.id)}
              returnId={returnId}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockRow({
  block,
  correction,
  returnId,
  onChanged,
  onError,
}: {
  block: RecognizedBlock;
  correction: VerificationCorrection | undefined;
  returnId: string;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(correction?.corrected_text ?? block.text);
  const [saving, setSaving] = useState(false);
  const needsCheck = block.confidence < REVIEW_CONFIDENCE_THRESHOLD && !correction;

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    onError(null);
    try {
      await saveCorrection({ returnId, blockId: block.id, correctedText: trimmed });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the correction");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!correction) return;
    onError(null);
    try {
      await removeCorrection(correction.id);
      setDraft(block.text);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not undo the correction");
    }
  }

  return (
    <li
      className={
        "rounded-md border px-3 py-2.5 text-sm " +
        (needsCheck ? "border-amber-500/50 bg-amber-500/5" : "border-border/60")
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {block.location && <span>{block.location}</span>}
        {block.linked_anchor && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono normal-case">
            {block.linked_anchor}
          </span>
        )}
        {needsCheck && (
          <span className="rounded border border-amber-500/50 px-1.5 py-0.5 normal-case tracking-normal text-amber-400">
            Needs your check
          </span>
        )}
        {correction && (
          <span className="rounded border border-emerald-500/50 px-1.5 py-0.5 normal-case tracking-normal text-emerald-400">
            corrected by you
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.trim() === ""}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Saving…" : "Save correction"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(correction?.corrected_text ?? block.text);
                setEditing(false);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1.5 leading-relaxed">
            {correction?.corrected_text ?? block.text}
          </p>
          {correction && (
            <p className="mt-1 text-xs text-muted-foreground line-through">{block.text}</p>
          )}
          {block.interpretation && (
            <p className="mt-1 text-xs italic text-muted-foreground">
              We took this to mean: {block.interpretation}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
            >
              {correction ? "Edit correction" : "Fix this"}
            </button>
            {correction && (
              <button
                type="button"
                onClick={undo}
                className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
              >
                Undo — keep the original reading
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function SegmentRow({
  segment,
  correction,
  returnId,
  onChanged,
  onError,
}: {
  segment: DictationSegment;
  correction: VerificationCorrection | undefined;
  returnId: string;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(correction?.corrected_text ?? segment.transcript);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    onError(null);
    try {
      await saveCorrection({ returnId, segmentId: segment.id, correctedText: trimmed });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save the correction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-md border border-border/60 px-3 py-2.5 text-sm">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {describeTarget(segment.resolved_target)}
        {correction && (
          <span className="ml-2 rounded border border-emerald-500/50 px-1.5 py-0.5 normal-case tracking-normal text-emerald-400">
            corrected by you
          </span>
        )}
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.trim() === ""}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(correction?.corrected_text ?? segment.transcript);
                setEditing(false);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 leading-relaxed">{correction?.corrected_text ?? segment.transcript}</p>
          {correction && (
            <p className="mt-1 text-xs text-muted-foreground line-through">{segment.transcript}</p>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
          >
            {correction ? "Edit correction" : "Fix this"}
          </button>
        </>
      )}
    </li>
  );
}
