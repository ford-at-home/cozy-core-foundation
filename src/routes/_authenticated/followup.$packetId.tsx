import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { brand, pageTitle } from "@/config/brand";
import { useDictation } from "@/hooks/use-dictation";
import { CREDIT_COST, isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";
import {
  FOLLOWUP_RESEARCH_COST,
  approveFollowupQuestions,
  prepareFollowupQuestions,
  runFollowupResearch,
} from "@/lib/followup.functions";
import {
  getPacketById,
  listDictationSegments,
  listFollowupsByPackets,
  listPageImages,
  listRecognizedBlocks,
  listReturnsByPackets,
  listRunsByPiece,
  type FollowupQuestion,
} from "@/lib/packet-workflow";
import { listCorrections } from "@/lib/packet-workflow";
import { latestVerdicts, isRejection } from "@/lib/verification";
import { listPacketQuestions } from "@/lib/packets";
import { Skeleton } from "@/components/ui/skeleton";

// The follow-up stage (docs/research-workflow/05): the student submits up to
// three follow-up research questions — typed, dictated, picked from the
// system's followup_opportunities, or lifted from their own verified
// handwriting. Suggested rewordings are shown BESIDE the original (never a
// silent replacement); the student approves the final wording, then a focused
// 2-credit research pass answers the approved questions and produces a NEW
// packet version. This screen is free until the explicit run step.
export const Route = createFileRoute("/_authenticated/followup/$packetId")({
  head: () => ({
    meta: [{ title: pageTitle("Follow-up research") }, { name: "robots", content: "noindex" }],
  }),
  component: FollowupPage,
});

const MAX_QUESTIONS = 3;
const primaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto";
const secondaryBtn =
  "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto";

type Opportunity = { question: string; why?: string };

function opportunitiesFromAnalysis(analysis: Record<string, unknown> | null): Opportunity[] {
  const raw = analysis?.followup_opportunities;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
    .map((o) => ({
      question: typeof o.question === "string" ? o.question : "",
      why: typeof o.why === "string" ? o.why : undefined,
    }))
    .filter((o) => o.question.trim() !== "")
    .slice(0, 6);
}

function FollowupPage() {
  const { packetId } = Route.useParams();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["followup", packetId],
    queryFn: async () => {
      const packet = await getPacketById(packetId);
      if (!packet) return null;
      const [followups, questions, runs, returns] = await Promise.all([
        listFollowupsByPackets([packetId]),
        listPacketQuestions(packetId),
        listRunsByPiece(packet.piece_id),
        listReturnsByPackets([packetId]),
      ]);
      // The student's own verified words answering the printed "follow-up
      // questions" prompt are the best starting candidates.
      const followupQuestion = questions.find((q) => q.function === "followup") ?? null;
      let handwrittenCandidates: string[] = [];
      if (followupQuestion && returns.length > 0) {
        const pagesPerReturn = await Promise.all(returns.map((r) => listPageImages(r.id)));
        const pageIds = pagesPerReturn.flat().map((p) => p.id);
        const [blocks, segmentsPerReturn] = await Promise.all([
          listRecognizedBlocks(pageIds),
          Promise.all(returns.map((r) => listDictationSegments(r.id))),
        ]);
        const segments = segmentsPerReturn.flat();
        const corrections = await listCorrections({
          blockIds: blocks.map((b) => b.id),
          segmentIds: segments.map((s) => s.id),
        });
        const verdicts = latestVerdicts(corrections);
        const effectiveQid = (
          verdict: (typeof corrections)[number] | undefined,
          fallback: string | null,
        ) => {
          const m = verdict?.corrected_meaning;
          if (m && typeof m === "object" && "questionId" in m) {
            const v = (m as Record<string, unknown>).questionId;
            return typeof v === "string" && v ? v : null;
          }
          return fallback;
        };
        const texts: string[] = [];
        for (const b of blocks) {
          const v = verdicts.blocks.get(b.id);
          if (isRejection(v)) continue;
          if (effectiveQid(v, b.linked_question_id) !== followupQuestion.id) continue;
          const text = (v ? v.corrected_text : b.text).trim();
          if (text) texts.push(text);
        }
        for (const s of segments) {
          const v = verdicts.segments.get(s.id);
          if (isRejection(v)) continue;
          const fallback =
            typeof s.resolved_target?.questionId === "string" ? s.resolved_target.questionId : null;
          if (effectiveQid(v, fallback) !== followupQuestion.id) continue;
          const text = (v ? v.corrected_text : s.transcript).trim();
          if (text) texts.push(text);
        }
        handwrittenCandidates = texts;
      }
      return {
        packet,
        followups,
        runs,
        opportunities: opportunitiesFromAnalysis(packet.analysis),
        handwrittenCandidates,
      };
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return false;
      const active = d.runs.some(
        (r) =>
          r.kind === "followup_research" &&
          !["completed", "failed", "cancelled"].includes(r.status),
      );
      return active ? 5000 : false;
    },
  });

  const pieceId = data?.packet.piece_id ?? null;
  const followups = useMemo(() => data?.followups ?? [], [data?.followups]);
  const activeRun =
    data?.runs.find(
      (r) =>
        r.kind === "followup_research" && !["completed", "failed", "cancelled"].includes(r.status),
    ) ?? null;
  const failedRun =
    !activeRun && followups.some((f) => f.status === "approved")
      ? (data?.runs.find((r) => r.kind === "followup_research" && r.status === "failed") ?? null)
      : null;
  const researched = followups.some((f) => f.status === "researched");
  const allApproved = followups.length > 0 && followups.every((f) => f.status === "approved");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">
            Follow-up research
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Ask up to three follow-up questions of your own — the things this research made you want
            to know. A focused second research pass answers them with authoritative sources and
            prepares a revised packet. Writing and refining questions is free; the research pass
            costs {FOLLOWUP_RESEARCH_COST} credits and runs only when you say so.
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
        <div className="space-y-3" aria-busy="true" aria-label="Loading follow-up">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && !data && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Packet not found. It may belong to another account.
        </div>
      )}

      {data && researched && pieceId && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          Your follow-up questions have been researched — the revised packet is on the project page.{" "}
          <Link to="/project/$pieceId" params={{ pieceId }} className="font-medium underline">
            See the revised packet →
          </Link>
        </div>
      )}

      {data && activeRun && pieceId && (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground sm:p-6">
          <h2 className="font-serif text-2xl tracking-tight">Researching your questions…</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The second research pass is running against your approved questions. This usually takes
            a few minutes; you can close this page — the result lands on the project page as a
            revised packet, and your original packet stays exactly as it was.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/runs/$runId" params={{ runId: activeRun.id }} className={secondaryBtn}>
              Watch progress
            </Link>
            <Link to="/project/$pieceId" params={{ pieceId }} className={secondaryBtn}>
              Back to the project
            </Link>
          </div>
        </section>
      )}

      {data && !researched && !activeRun && (
        <>
          {failedRun && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">
                The follow-up research run didn't finish.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your questions are still approved and the credit hold was released — you were not
                charged. Run it again below, or{" "}
                <Link to="/runs/$runId" params={{ runId: failedRun.id }} className="underline">
                  see what happened
                </Link>
                .
              </p>
            </div>
          )}
          {allApproved && pieceId ? (
            <ApprovedPanel
              packetId={packetId}
              followups={followups}
              onChanged={refetch}
              onDispatched={pieceId}
            />
          ) : (
            <QuestionEditor
              packetId={packetId}
              followups={followups}
              opportunities={data.opportunities}
              handwrittenCandidates={data.handwrittenCandidates}
              onChanged={refetch}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Local editing model for one question slot. */
type Slot = {
  student: string;
  suggested: string | null;
  /** Which wording the student is going with; "edited" once they diverge. */
  final: string;
};

function slotsFromRows(rows: FollowupQuestion[]): Slot[] {
  return rows.slice(0, MAX_QUESTIONS).map((r) => ({
    student: r.student_text,
    suggested: r.suggested_text,
    final: r.approved_text ?? r.student_text,
  }));
}

function QuestionEditor({
  packetId,
  followups,
  opportunities,
  handwrittenCandidates,
  onChanged,
}: {
  packetId: string;
  followups: FollowupQuestion[];
  opportunities: Opportunity[];
  handwrittenCandidates: string[];
  onChanged: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const prepare = useServerFn(prepareFollowupQuestions);
  const approve = useServerFn(approveFollowupQuestions);
  const [slots, setSlots] = useState<Slot[]>(() =>
    followups.length > 0 ? slotsFromRows(followups) : [{ student: "", suggested: null, final: "" }],
  );
  const [busy, setBusy] = useState<"suggest" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // State drives the button label; the ref is what dictation reads at insert
  // time (onFocus updates both so the label never goes stale).
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const dictation = useDictation((text) => {
    const i = Math.min(activeSlotRef.current, slots.length - 1);
    setSlots((prev) =>
      prev.map((s, j) =>
        j === i
          ? {
              ...s,
              student: s.student.trim() ? `${s.student.trim()} ${text}` : text,
              suggested: null,
            }
          : s,
      ),
    );
  });

  const hasSuggestions = slots.some((s) => s.suggested);
  const filled = slots.filter((s) => s.student.trim() !== "");
  const canAct = filled.length >= 1 && busy === null;

  function setStudent(i: number, value: string) {
    // Editing the question invalidates its old suggestion.
    setSlots((prev) =>
      prev.map((s, j) => (j === i ? { ...s, student: value, suggested: null } : s)),
    );
  }

  function addCandidate(text: string) {
    setSlots((prev) => {
      const emptyIdx = prev.findIndex((s) => s.student.trim() === "");
      if (emptyIdx >= 0)
        return prev.map((s, j) => (j === emptyIdx ? { ...s, student: text, suggested: null } : s));
      if (prev.length < MAX_QUESTIONS)
        return [...prev, { student: text, suggested: null, final: text }];
      return prev;
    });
  }

  async function getSuggestions() {
    if (!canAct) return;
    setBusy("suggest");
    setError(null);
    try {
      await prepare({
        data: { packetId, questions: filled.map((s) => s.student.trim()) },
      });
      await queryClient.invalidateQueries({ queryKey: ["followup", packetId] });
      const rows = await listFollowupsByPackets([packetId]);
      setSlots(slotsFromRows(rows));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get suggestions");
    } finally {
      setBusy(null);
    }
  }

  async function approveQuestions() {
    if (!canAct) return;
    setBusy("approve");
    setError(null);
    try {
      await approve({
        data: {
          packetId,
          questions: filled.map((s) => ({
            studentText: s.student.trim(),
            approvedText: (s.suggested ? s.final : s.student).trim() || s.student.trim(),
            suggestedText: s.suggested,
          })),
        },
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve the questions");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <div>
        <h2 className="font-serif text-2xl tracking-tight">Your questions</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Type, dictate, or start from a suggestion below. You can ask for a narrower rewording — it
          appears beside your version, and you choose which wording runs. Your original is never
          rewritten silently.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {(handwrittenCandidates.length > 0 || opportunities.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Starting points — tap to use
          </p>
          <div className="flex flex-wrap gap-1.5">
            {handwrittenCandidates.map((c, i) => (
              <button
                key={`h-${i}`}
                type="button"
                onClick={() => addCandidate(c)}
                className="inline-flex min-h-11 max-w-full items-center rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs leading-snug hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/60"
                title="From your returned work"
              >
                <span className="line-clamp-2">✍ {c}</span>
              </button>
            ))}
            {opportunities.map((o, i) => (
              <button
                key={`o-${i}`}
                type="button"
                onClick={() => addCandidate(o.question)}
                className="inline-flex min-h-11 max-w-full items-center rounded-md border border-border bg-background/60 px-3 py-2 text-left text-xs leading-snug hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                title={o.why}
              >
                <span className="line-clamp-2">{o.question}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {slots.map((slot, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`fq-${i}`}
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Question {i + 1}
              </label>
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove question ${i + 1}`}
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              id={`fq-${i}`}
              value={slot.student}
              onChange={(e) => setStudent(i, e.target.value)}
              onFocus={() => {
                activeSlotRef.current = i;
                setActiveSlot(i);
              }}
              rows={2}
              placeholder="What do you want to know now that you've worked through the packet?"
              className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
            />
            {slot.suggested && (
              <fieldset className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <legend className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Suggested narrower wording — your choice
                </legend>
                <label className="flex min-h-11 items-start gap-2 py-1.5 text-sm leading-snug">
                  <input
                    type="radio"
                    name={`choice-${i}`}
                    checked={slot.final === slot.student}
                    onChange={() =>
                      setSlots((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, final: s.student } : s)),
                      )
                    }
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 break-words">
                    <span className="text-xs text-muted-foreground">Keep mine: </span>
                    {slot.student}
                  </span>
                </label>
                <label className="flex min-h-11 items-start gap-2 py-1.5 text-sm leading-snug">
                  <input
                    type="radio"
                    name={`choice-${i}`}
                    checked={slot.final === slot.suggested}
                    onChange={() =>
                      setSlots((prev) =>
                        prev.map((s, j) =>
                          j === i ? { ...s, final: s.suggested ?? s.student } : s,
                        ),
                      )
                    }
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 break-words">
                    <span className="text-xs text-muted-foreground">Use suggestion: </span>
                    {slot.suggested}
                  </span>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Or edit the final wording
                  </span>
                  <textarea
                    value={slot.final}
                    onChange={(e) =>
                      setSlots((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, final: e.target.value } : s)),
                      )
                    }
                    rows={2}
                    className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
                  />
                </label>
              </fieldset>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {slots.length < MAX_QUESTIONS && (
          <button
            type="button"
            onClick={() =>
              setSlots((prev) => [...prev, { student: "", suggested: null, final: "" }])
            }
            className={secondaryBtn}
          >
            + Add another question
          </button>
        )}
        <button
          type="button"
          onClick={dictation.recording ? () => void dictation.stop() : () => void dictation.start()}
          disabled={dictation.transcribing}
          aria-pressed={dictation.recording}
          className={
            secondaryBtn +
            (dictation.recording ? " border-destructive/60 bg-destructive/10 text-destructive" : "")
          }
        >
          {dictation.transcribing
            ? "Transcribing…"
            : dictation.recording
              ? "Stop recording"
              : `Dictate into question ${Math.min(activeSlot, slots.length - 1) + 1}`}
        </button>
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
              className="mt-2 inline-flex min-h-11 items-center rounded-md border border-destructive/50 bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {dictation.transcribing ? "Retrying…" : "Retry transcription"}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
        {!hasSuggestions && (
          <button
            type="button"
            onClick={getSuggestions}
            disabled={!canAct}
            className={secondaryBtn}
          >
            {busy === "suggest" ? "Getting suggestions…" : "Suggest narrower wording (free)"}
          </button>
        )}
        <button type="button" onClick={approveQuestions} disabled={!canAct} className={primaryBtn}>
          {busy === "approve"
            ? "Saving…"
            : hasSuggestions
              ? "Approve the chosen wording →"
              : "Approve as written →"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving is free and only locks the wording. The {FOLLOWUP_RESEARCH_COST}-credit research
        pass is a separate, explicit step.
      </p>
    </section>
  );
}

function ApprovedPanel({
  packetId,
  followups,
  onChanged,
  onDispatched,
}: {
  packetId: string;
  followups: FollowupQuestion[];
  onChanged: () => Promise<unknown>;
  /** pieceId to navigate to after dispatch. */
  onDispatched: string;
}) {
  const router = useRouter();
  const run = useServerFn(runFollowupResearch);
  const prepare = useServerFn(prepareFollowupQuestions);
  const { balance } = useCreditBalance();
  const [running, setRunning] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Idempotency seed: stable per mount so a double-tap can't dispatch twice.
  const requestId = useMemo(() => crypto.randomUUID(), []);

  const outOfCredits = balance !== null && balance < FOLLOWUP_RESEARCH_COST;
  const paywalled = error !== null && isInsufficientCreditsError(error);

  async function startResearch() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      await run({ data: { packetId, requestId } });
      router.navigate({ to: "/project/$pieceId", params: { pieceId: onDispatched } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the research");
      setRunning(false);
    }
  }

  /** Reopen editing by re-submitting the approved wording as plain questions. */
  async function changeQuestions() {
    if (reopening || running) return;
    setReopening(true);
    setError(null);
    try {
      await prepare({
        data: {
          packetId,
          questions: followups.map((f) => f.approved_text ?? f.student_text),
          suggestRefinements: false,
        },
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen the questions");
    } finally {
      setReopening(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <div>
        <h2 className="font-serif text-2xl tracking-tight">Approved questions</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          These exact wordings go to the research pass. The result arrives as a revised packet —
          your original packet and your handwritten work stay untouched.
        </p>
      </div>

      <ol className="space-y-3">
        {followups.map((f) => (
          <li key={f.id} className="rounded-lg border border-border bg-background/40 p-3 text-sm">
            <p className="break-words leading-relaxed">
              <span className="mr-2 font-mono text-xs font-semibold text-muted-foreground">
                {f.position}.
              </span>
              {f.approved_text ?? f.student_text}
            </p>
            {f.approved_text && f.approved_text !== f.student_text && (
              <p className="mt-1 text-xs text-muted-foreground">
                Your original: “{f.student_text}”
              </p>
            )}
          </li>
        ))}
      </ol>

      {(outOfCredits || paywalled) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          The follow-up research pass uses {FOLLOWUP_RESEARCH_COST} credits
          {balance !== null ? ` and you have ${balance}` : ""}.{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </div>
      )}

      {error && !paywalled && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={changeQuestions}
          disabled={reopening || running}
          className={secondaryBtn}
        >
          {reopening ? "Reopening…" : "Change the questions"}
        </button>
        <button
          type="button"
          onClick={startResearch}
          disabled={running || outOfCredits}
          aria-busy={running}
          className={primaryBtn}
        >
          {running
            ? "Starting the research…"
            : `Run follow-up research — ${FOLLOWUP_RESEARCH_COST} credits`}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {FOLLOWUP_RESEARCH_COST} credits are held when the run starts and only kept if it completes
        — a failed run releases the hold. (Starting fresh research costs {CREDIT_COST.research}{" "}
        credits too; this pass is the same depth, focused on your questions.)
      </p>
    </section>
  );
}
