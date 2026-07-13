// Pure helpers for the verification (Review) step. The rules the UI and the
// downstream synthesis rely on:
//   - corrections are append-only; the latest correction per target wins,
//   - a correction row IS the verdict: text equal to the recognition is a
//     confirmation, different text is a fix, empty text is a rejection,
//   - low-confidence blocks REQUIRE an explicit verdict before approval
//     (everything else defaults to confirmed on approve),
//   - a handwriting block and a dictation segment answering the same
//     question is a conflict the student must resolve,
//   - the verified response set = non-rejected blocks/segments with
//     corrections applied. Tested in tests/verification.test.ts.

import type {
  DictationSegment,
  RecognizedBlock,
  VerificationCorrection,
} from "@/lib/packet-workflow";

/** Mirror of LOW_CONFIDENCE_THRESHOLD in supabase/functions/_shared/recognition.ts. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export type VerdictMaps = {
  blocks: Map<string, VerificationCorrection>;
  segments: Map<string, VerificationCorrection>;
};

/** Latest correction per block/segment (append-only log, last one wins). */
export function latestVerdicts(corrections: VerificationCorrection[]): VerdictMaps {
  const blocks = new Map<string, VerificationCorrection>();
  const segments = new Map<string, VerificationCorrection>();
  const ordered = [...corrections].sort((a, b) => a.verified_at.localeCompare(b.verified_at));
  for (const c of ordered) {
    if (c.block_id) blocks.set(c.block_id, c);
    if (c.segment_id) segments.set(c.segment_id, c);
  }
  return { blocks, segments };
}

/** An empty corrected_text is the student saying "this is not my writing". */
export function isRejection(c: VerificationCorrection | undefined): boolean {
  return c !== undefined && c.corrected_text.trim() === "";
}

/** True when this block cannot be silently accepted. */
export function needsExplicitVerdict(block: RecognizedBlock): boolean {
  return block.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Blocks that still require a verdict before the return can be approved. */
export function unresolvedRequiredBlocks(
  blocks: RecognizedBlock[],
  verdicts: VerdictMaps,
): RecognizedBlock[] {
  return blocks.filter((b) => needsExplicitVerdict(b) && !verdicts.blocks.has(b.id));
}

/** The question a dictation segment says it answers (resolved_target jsonb). */
export function segmentQuestionId(segment: DictationSegment): string | null {
  const q = segment.resolved_target?.questionId;
  return typeof q === "string" && q ? q : null;
}

export type Conflict = {
  questionId: string;
  block: RecognizedBlock;
  segment: DictationSegment;
};

/**
 * Handwriting and dictation answering the same question: the student must
 * pick (or keep both). Resolved once either side carries a verdict.
 */
export function findConflicts(
  blocks: RecognizedBlock[],
  segments: DictationSegment[],
  verdicts: VerdictMaps,
): Conflict[] {
  const out: Conflict[] = [];
  const live = blocks.filter(
    (b) => b.linked_question_id && !isRejection(verdicts.blocks.get(b.id)),
  );
  for (const seg of segments) {
    const qid = segmentQuestionId(seg);
    if (!qid) continue;
    if (isRejection(verdicts.segments.get(seg.id))) continue;
    for (const b of live) {
      if (b.linked_question_id === qid) {
        const resolved = verdicts.blocks.has(b.id) || verdicts.segments.has(seg.id);
        if (!resolved) out.push({ questionId: qid, block: b, segment: seg });
      }
    }
  }
  return out;
}

export type VerifiedResponse = {
  source: "handwriting" | "dictation";
  text: string;
  linked_question_id: string | null;
  linked_anchor: string | null;
  annotation_type: string | null;
};

/**
 * The authoritative student contribution after approval: blocks and
 * dictation segments, minus rejected ones, with corrected text applied.
 */
export function verifiedResponses(
  blocks: RecognizedBlock[],
  segments: DictationSegment[],
  corrections: VerificationCorrection[],
): VerifiedResponse[] {
  const verdicts = latestVerdicts(corrections);
  const out: VerifiedResponse[] = [];
  for (const b of blocks) {
    const v = verdicts.blocks.get(b.id);
    if (isRejection(v)) continue;
    const text = v ? v.corrected_text : b.text;
    if (text.trim() === "") continue;
    out.push({
      source: "handwriting",
      text,
      linked_question_id: b.linked_question_id,
      linked_anchor: b.linked_anchor,
      annotation_type: b.annotation_type,
    });
  }
  for (const s of segments) {
    const v = verdicts.segments.get(s.id);
    if (isRejection(v)) continue;
    const text = v ? v.corrected_text : s.transcript;
    if (text.trim() === "") continue;
    out.push({
      source: "dictation",
      text,
      linked_question_id: segmentQuestionId(s),
      linked_anchor:
        typeof s.resolved_target?.anchor === "string" ? s.resolved_target.anchor : null,
      annotation_type: null,
    });
  }
  return out;
}
