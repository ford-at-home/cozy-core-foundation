// Pure helpers for the verification (Review) step. The rules the UI and the
// downstream synthesis rely on:
//   - only the LATEST recognition attempt per page is reviewable,
//   - corrections are append-only; the latest correction per target wins,
//   - unreadable and low-confidence blocks REQUIRE an explicit verdict
//     before approval (everything else defaults to confirmed on approve),
//   - a handwriting block and a dictation segment answering the same
//     question is a conflict the student must resolve,
//   - the verified response set = non-rejected blocks/segments with
//     corrections applied. Tested in tests/verification.test.ts.

import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/recognition-constants";
import type {
  DictationSegment,
  RecognizedBlock,
  VerificationCorrection,
} from "@/lib/packet-workflow";

export { LOW_CONFIDENCE_THRESHOLD };

/** Blocks from the latest recognition attempt of each page. */
export function latestAttemptBlocks(blocks: RecognizedBlock[]): RecognizedBlock[] {
  const maxAttempt = new Map<string, number>();
  for (const b of blocks) {
    const cur = maxAttempt.get(b.page_image_id) ?? 0;
    if (b.attempt > cur) maxAttempt.set(b.page_image_id, b.attempt);
  }
  return blocks
    .filter((b) => b.attempt === maxAttempt.get(b.page_image_id))
    .sort((a, b) => a.position - b.position);
}

export type VerdictMaps = {
  blocks: Map<string, VerificationCorrection>;
  segments: Map<string, VerificationCorrection>;
};

/** Latest correction per block/segment (append-only log, last one wins). */
export function latestVerdicts(corrections: VerificationCorrection[]): VerdictMaps {
  const blocks = new Map<string, VerificationCorrection>();
  const segments = new Map<string, VerificationCorrection>();
  const ordered = [...corrections].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const c of ordered) {
    if (c.block_id) blocks.set(c.block_id, c);
    if (c.segment_id) segments.set(c.segment_id, c);
  }
  return { blocks, segments };
}

/** True when this block cannot be silently accepted. */
export function needsExplicitVerdict(block: RecognizedBlock): boolean {
  if (block.text.trim() === "" && block.kind !== "annotation") return true; // unreadable
  return block.confidence !== null && block.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/** Blocks that still require a verdict before the return can be approved. */
export function unresolvedRequiredBlocks(
  blocks: RecognizedBlock[],
  verdicts: VerdictMaps,
): RecognizedBlock[] {
  return latestAttemptBlocks(blocks).filter(
    (b) => needsExplicitVerdict(b) && !verdicts.blocks.has(b.id),
  );
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
  const live = latestAttemptBlocks(blocks).filter(
    (b) => b.linked_question_id && verdicts.blocks.get(b.id)?.action !== "reject",
  );
  for (const seg of segments) {
    if (!seg.linked_question_id) continue;
    if (verdicts.segments.get(seg.id)?.action === "reject") continue;
    for (const b of live) {
      if (b.linked_question_id === seg.linked_question_id) {
        const resolved = verdicts.blocks.has(b.id) || verdicts.segments.has(seg.id);
        if (!resolved) out.push({ questionId: seg.linked_question_id, block: b, segment: seg });
      }
    }
  }
  return out;
}

export type VerifiedResponse = {
  source: "handwriting" | "dictation";
  kind: RecognizedBlock["kind"] | "response";
  text: string;
  linked_question_id: string | null;
  linked_anchor: string | null;
  annotation_type: string | null;
};

/**
 * The authoritative student contribution after approval: latest-attempt
 * blocks and dictation segments, minus rejected ones, with corrections
 * applied (text and question links).
 */
export function verifiedResponses(
  blocks: RecognizedBlock[],
  segments: DictationSegment[],
  corrections: VerificationCorrection[],
): VerifiedResponse[] {
  const verdicts = latestVerdicts(corrections);
  const out: VerifiedResponse[] = [];
  for (const b of latestAttemptBlocks(blocks)) {
    const v = verdicts.blocks.get(b.id);
    if (v?.action === "reject") continue;
    const text = v?.action === "correct" && v.corrected_text !== null ? v.corrected_text : b.text;
    if (text.trim() === "" && !b.annotation_type) continue; // unreadable, never typed in
    out.push({
      source: "handwriting",
      kind: b.kind,
      text,
      linked_question_id: v?.linked_question_id ?? b.linked_question_id,
      linked_anchor: b.linked_anchor,
      annotation_type: b.annotation_type,
    });
  }
  for (const s of segments) {
    const v = verdicts.segments.get(s.id);
    if (v?.action === "reject") continue;
    const text =
      v?.action === "correct" && v.corrected_text !== null ? v.corrected_text : s.transcript;
    if (text.trim() === "") continue;
    out.push({
      source: "dictation",
      kind: "response",
      text,
      linked_question_id: v?.linked_question_id ?? s.linked_question_id,
      linked_anchor: s.resolved_target?.anchor ?? null,
      annotation_type: null,
    });
  }
  return out;
}
