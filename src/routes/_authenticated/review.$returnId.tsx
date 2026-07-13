import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import { verifyStudentResponses, type CorrectionInput } from "@/lib/packet-return.functions";
import {
  getPacketById,
  getReturn,
  listCorrections,
  listDictationSegments,
  listPageImages,
  listRecognizedBlocks,
  type DictationSegment,
  type PageImage,
  type RecognizedBlock,
} from "@/lib/packet-workflow";
import { LOW_CONFIDENCE_THRESHOLD, segmentQuestionId } from "@/lib/verification";
import { listPacketQuestions, type PacketQuestion } from "@/lib/packets";
import { Skeleton } from "@/components/ui/skeleton";

// Mandatory human verification (docs/research-workflow/04): the student sees
// each photographed page beside what was read from it, corrects transcription
// errors, resolves handwriting-vs-dictation conflicts, and approves. Nothing
// inferred is presented as confirmed until the student says so. Approval
// writes append-only verification_corrections via verify-student-responses —
// a row per reviewed item; text equal to the recognition is a confirmation,
// different text is a fix, empty text is a rejection.
export const Route = createFileRoute("/_authenticated/review/$returnId")({
  head: () => ({
    meta: [{ title: pageTitle("Review what was read") }, { name: "robots", content: "noindex" }],
  }),
  component: ReviewPage,
});

const primaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto";
const chipBtn =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40";

/** Local review state per block/segment; persisted only on approve. */
type ItemState = {
  text: string;
  questionId: string | null;
  decision: "pending" | "kept" | "rejected";
};

function ReviewPage() {
  const { returnId } = Route.useParams();
  const router = useRouter();
  const verify = useServerFn(verifyStudentResponses);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["review", returnId],
    queryFn: async () => {
      const ret = await getReturn(returnId);
      if (!ret) return null;
      const [packet, pages, segments] = await Promise.all([
        getPacketById(ret.packet_id),
        listPageImages(returnId),
        listDictationSegments(returnId),
      ]);
      const [questions, blocks] = await Promise.all([
        listPacketQuestions(ret.packet_id),
        listRecognizedBlocks(pages.map((p) => p.id)),
      ]);
      const corrections = await listCorrections({
        blockIds: blocks.map((b) => b.id),
        segmentIds: segments.map((s) => s.id),
      });
      return { ret, packet, pages, segments, questions, blocks, corrections };
    },
  });

  const pieceId = data?.packet?.piece_id ?? null;
  const verified = (data?.corrections.length ?? 0) > 0;

  const state = (id: string, fallback: () => ItemState): ItemState => items[id] ?? fallback();
  const setItem = (id: string, patch: Partial<ItemState>, fallback: () => ItemState) =>
    setItems((prev) => ({ ...prev, [id]: { ...(prev[id] ?? fallback()), ...patch } }));

  const blockFallback = (b: RecognizedBlock) => (): ItemState => ({
    text: b.text,
    questionId: b.linked_question_id,
    decision: "pending",
  });
  const segmentFallback = (s: DictationSegment) => (): ItemState => ({
    text: s.transcript,
    questionId: segmentQuestionId(s),
    decision: "pending",
  });

  // Conflicts: handwriting and dictation both answering the same question,
  // where neither side has been acted on yet. Never resolved silently.
  const conflicts = useMemo(() => {
    if (!data) return [];
    const out: Array<{
      question: PacketQuestion | null;
      block: RecognizedBlock;
      segment: DictationSegment;
    }> = [];
    for (const s of data.segments) {
      const sState = items[s.id];
      const sQid = sState?.questionId ?? segmentQuestionId(s);
      if (!sQid || sState?.decision === "rejected") continue;
      for (const b of data.blocks) {
        const bState = items[b.id];
        const bQid = bState?.questionId ?? b.linked_question_id;
        if (bQid !== sQid || bState?.decision === "rejected") continue;
        const acted =
          (bState?.decision ?? "pending") !== "pending" ||
          (sState?.decision ?? "pending") !== "pending";
        if (!acted) {
          out.push({
            question: data.questions.find((q) => q.id === sQid) ?? null,
            block: b,
            segment: s,
          });
        }
      }
    }
    return out;
  }, [data, items]);

  const unresolvedLowConfidence = useMemo(() => {
    if (!data) return [];
    return data.blocks.filter(
      (b) =>
        b.confidence < LOW_CONFIDENCE_THRESHOLD &&
        (items[b.id]?.decision ?? "pending") === "pending",
    );
  }, [data, items]);

  const canApprove =
    !verified &&
    !approving &&
    (data?.blocks.length ?? 0) + (data?.segments.length ?? 0) > 0 &&
    unresolvedLowConfidence.length === 0 &&
    conflicts.length === 0;

  async function approve() {
    if (!data || !pieceId || approving) return;
    setApproving(true);
    setError(null);
    try {
      const corrections: CorrectionInput[] = [];
      for (const b of data.blocks) {
        const st = state(b.id, blockFallback(b));
        corrections.push({
          blockId: b.id,
          correctedText: st.decision === "rejected" ? "" : st.text.trim(),
          correctedMeaning: {
            action:
              st.decision === "rejected"
                ? "rejected"
                : st.text.trim() === b.text
                  ? "confirmed"
                  : "corrected",
            questionId: st.questionId,
          },
        });
      }
      for (const s of data.segments) {
        const st = state(s.id, segmentFallback(s));
        corrections.push({
          segmentId: s.id,
          correctedText: st.decision === "rejected" ? "" : st.text.trim(),
          correctedMeaning: {
            action:
              st.decision === "rejected"
                ? "rejected"
                : st.text.trim() === s.transcript
                  ? "confirmed"
                  : "corrected",
            questionId: st.questionId,
          },
        });
      }
      await verify({ data: { pieceId, corrections } });
      await refetch();
      router.navigate({ to: "/project/$pieceId", params: { pieceId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">
            Review what was read
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            This is what the system read from your pages and dictation. Fix anything it got wrong,
            remove anything that isn't yours, and approve. Only what you approve moves forward —
            nothing is assumed.
          </p>
        </div>
        {pieceId && (
          <Link
            to="/project/$pieceId"
            params={{ pieceId }}
            className="inline-flex min-h-11 shrink-0 items-center rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-0"
          >
            ← Back to project
          </Link>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading review">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && !data && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Return not found. It may belong to another account.
        </div>
      )}

      {verified && pieceId && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          This return is verified — your approved words are what moves forward.{" "}
          <Link to="/project/$pieceId" params={{ pieceId }} className="font-medium underline">
            Continue on the project page →
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

      {data && !verified && conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">
            {conflicts.length === 1
              ? "One question has both handwriting and a dictated answer."
              : `${conflicts.length} questions have both handwriting and a dictated answer.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Decide which to keep (or keep both) — press "Looks right" or "Remove" on each version
            below. Nothing is chosen for you.
          </p>
        </div>
      )}

      {data && !verified && data.pages.length === 0 && data.segments.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing to review yet — return your pages or dictate answers first.
        </div>
      )}

      {data &&
        data.pages
          .filter((p) => p.status === "analyzed")
          .map((page) => (
            <PageReviewCard
              key={page.id}
              page={page}
              blocks={data.blocks.filter((b) => b.page_image_id === page.id)}
              questions={data.questions}
              readOnly={verified}
              getState={(b) => state(b.id, blockFallback(b))}
              setState={(b, patch) => setItem(b.id, patch, blockFallback(b))}
            />
          ))}

      {data && data.segments.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
          <h2 className="font-serif text-2xl tracking-tight">Dictated answers</h2>
          <ul className="space-y-3">
            {data.segments.map((s) => (
              <ItemEditor
                key={s.id}
                id={s.id}
                sourceLabel="dictation"
                originalText={s.transcript}
                lowConfidence={false}
                questions={data.questions}
                readOnly={verified}
                state={state(s.id, segmentFallback(s))}
                onChange={(patch) => setItem(s.id, patch, segmentFallback(s))}
              />
            ))}
          </ul>
        </section>
      )}

      {data && !verified && (data.blocks.length > 0 || data.segments.length > 0) && (
        <div className="space-y-3 border-t border-border/60 pt-5">
          {unresolvedLowConfidence.length > 0 && (
            <p className="text-xs text-amber-500">
              {unresolvedLowConfidence.length === 1
                ? "1 low-confidence reading still needs your decision"
                : `${unresolvedLowConfidence.length} low-confidence readings still need your decision`}{" "}
              — they're marked "uncertain" above. Confirm or remove each one.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Approving saves your corrections and unlocks follow-up research and the final
              document. Everything stays editable until you approve.
            </p>
            <button
              type="button"
              onClick={approve}
              disabled={!canApprove}
              aria-busy={approving}
              className={primaryBtn}
            >
              {approving ? "Saving your review…" : "Approve — this is what I wrote →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PageReviewCard({
  page,
  blocks,
  questions,
  readOnly,
  getState,
  setState,
}: {
  page: PageImage;
  blocks: RecognizedBlock[];
  questions: PacketQuestion[];
  readOnly: boolean;
  getState: (b: RecognizedBlock) => ItemState;
  setState: (b: RecognizedBlock, patch: Partial<ItemState>) => void;
}) {
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

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 className="font-serif text-2xl tracking-tight">
        {page.page_number ? `Page ${page.page_number}` : "Page photo"}
      </h2>
      {/* The photo sits beside its readings on wide screens, above on phones,
          so every correction happens with the source in view. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-muted sm:sticky sm:top-4 sm:self-start">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" aria-label="Open the full-size photo">
              <img src={url} alt="Your returned page" className="w-full object-contain" />
            </a>
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </div>
        <div className="min-w-0">
          {blocks.length === 0 ? (
            <p className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
              No handwriting was found on this page. If you wrote on it, the photo may need a retake
              with better light.
            </p>
          ) : (
            <ul className="space-y-3">
              {blocks.map((b) => (
                <ItemEditor
                  key={b.id}
                  id={b.id}
                  sourceLabel={
                    b.annotation_type === "response" ? "response" : (b.annotation_type ?? "note")
                  }
                  originalText={b.text}
                  lowConfidence={b.confidence < LOW_CONFIDENCE_THRESHOLD}
                  questions={questions}
                  readOnly={readOnly}
                  state={getState(b)}
                  onChange={(patch) => setState(b, patch)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ItemEditor({
  id,
  sourceLabel,
  originalText,
  lowConfidence,
  questions,
  readOnly,
  state,
  onChange,
}: {
  id: string;
  sourceLabel: string;
  originalText: string;
  lowConfidence: boolean;
  questions: PacketQuestion[];
  readOnly: boolean;
  state: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
}) {
  const rejected = state.decision === "rejected";
  const kept = state.decision === "kept";
  const edited = state.text.trim() !== originalText.trim();
  const qIndex = state.questionId ? questions.findIndex((q) => q.id === state.questionId) : -1;

  return (
    <li
      className={
        "space-y-2 rounded-lg border p-3 " +
        (rejected
          ? "border-border bg-background/30 opacity-60"
          : lowConfidence && state.decision === "pending"
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-border bg-background/40")
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{sourceLabel.replace(/_/g, " ")}</span>
        {lowConfidence && !rejected && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 normal-case text-amber-500">
            uncertain — please check
          </span>
        )}
        {kept && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 normal-case">
            {edited ? "fixed" : "confirmed"}
          </span>
        )}
        {rejected && <span className="normal-case">removed — won't be used</span>}
      </div>

      {readOnly ? (
        <p className="text-sm leading-relaxed">{state.text}</p>
      ) : (
        <>
          <label className="sr-only" htmlFor={`text-${id}`}>
            Corrected text
          </label>
          <textarea
            id={`text-${id}`}
            value={state.text}
            onChange={(e) => onChange({ text: e.target.value, decision: "kept" })}
            disabled={rejected}
            rows={Math.min(6, Math.max(2, Math.ceil(state.text.length / 60)))}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 sm:text-sm"
          />
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Answers
            <select
              value={state.questionId ?? ""}
              onChange={(e) => onChange({ questionId: e.target.value || null })}
              disabled={rejected}
              className="min-h-9 max-w-full rounded-md border border-input bg-background/60 px-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-xs"
            >
              <option value="">no specific question</option>
              {questions.map((q, i) => (
                <option key={q.id} value={q.id}>
                  Q{i + 1} — {q.prompt.slice(0, 60)}
                  {q.prompt.length > 60 ? "…" : ""}
                </option>
              ))}
            </select>
            {qIndex >= 0 && <span className="sr-only">currently question {qIndex + 1}</span>}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {rejected ? (
              <button
                type="button"
                onClick={() => onChange({ decision: "pending", text: originalText })}
                className={chipBtn + " border-border hover:bg-accent"}
              >
                Undo remove
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onChange({ decision: "kept" })}
                  className={
                    chipBtn +
                    (kept
                      ? " border-emerald-500/50 bg-emerald-500/10"
                      : " border-border hover:bg-accent")
                  }
                >
                  Looks right
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ decision: "rejected" })}
                  className={
                    chipBtn +
                    " border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                  }
                >
                  Remove — not mine / wrong
                </button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  );
}
