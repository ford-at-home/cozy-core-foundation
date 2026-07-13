// Verification (Review) rules: corrections are append-only and the latest
// wins; a correction row is the verdict (same text = confirm, new text =
// fix, empty text = reject); low-confidence blocks demand explicit action;
// handwriting-vs-dictation conflicts are never resolved silently; the
// verified set is what feeds follow-up research and the final artifacts.

import { describe, expect, it } from "vitest";
import type {
  DictationSegment,
  RecognizedBlock,
  VerificationCorrection,
} from "../src/lib/packet-workflow";
import {
  LOW_CONFIDENCE_THRESHOLD,
  findConflicts,
  isRejection,
  latestVerdicts,
  needsExplicitVerdict,
  segmentQuestionId,
  unresolvedRequiredBlocks,
  verifiedResponses,
} from "../src/lib/verification";

const T0 = "2026-07-13T00:00:00Z";
const T1 = "2026-07-13T01:00:00Z";

const block = (over: Partial<RecognizedBlock> = {}): RecognizedBlock => ({
  id: "b1",
  page_image_id: "img1",
  user_id: "u1",
  location: {},
  text: "handwritten answer",
  confidence: 0.9,
  annotation_type: "response",
  interpretation_confidence: null,
  linked_question_id: null,
  linked_anchor: null,
  created_at: T0,
  ...over,
});

const segment = (over: Partial<DictationSegment> = {}): DictationSegment => ({
  id: "s1",
  return_id: "ret1",
  packet_id: "p1",
  user_id: "u1",
  transcript: "dictated answer",
  resolved_target: {},
  segment_order: 0,
  storage_path: null,
  created_at: T0,
  ...over,
});

const correction = (over: Partial<VerificationCorrection> = {}): VerificationCorrection => ({
  id: "c1",
  block_id: null,
  segment_id: null,
  user_id: "u1",
  corrected_text: "text",
  corrected_meaning: null,
  verified_at: T0,
  created_at: T0,
  ...over,
});

describe("latestVerdicts", () => {
  it("keeps only the newest correction per target", () => {
    const verdicts = latestVerdicts([
      correction({ id: "old", block_id: "b1", corrected_text: "first", verified_at: T0 }),
      correction({ id: "new", block_id: "b1", corrected_text: "second", verified_at: T1 }),
      correction({ id: "seg", segment_id: "s1", corrected_text: "spoken", verified_at: T0 }),
    ]);
    expect(verdicts.blocks.get("b1")?.corrected_text).toBe("second");
    expect(verdicts.segments.get("s1")?.corrected_text).toBe("spoken");
  });
});

describe("verdict semantics", () => {
  it("empty corrected_text is a rejection", () => {
    expect(isRejection(correction({ corrected_text: "" }))).toBe(true);
    expect(isRejection(correction({ corrected_text: "  " }))).toBe(true);
    expect(isRejection(correction({ corrected_text: "kept" }))).toBe(false);
    expect(isRejection(undefined)).toBe(false);
  });
});

describe("low-confidence gate", () => {
  it("requires explicit verdicts below the threshold", () => {
    expect(needsExplicitVerdict(block({ confidence: LOW_CONFIDENCE_THRESHOLD - 0.01 }))).toBe(true);
    expect(needsExplicitVerdict(block({ confidence: LOW_CONFIDENCE_THRESHOLD }))).toBe(false);
  });

  it("lists unresolved low-confidence blocks until a correction lands", () => {
    const blocks = [block({ id: "low", confidence: 0.2 }), block({ id: "ok", confidence: 0.9 })];
    const before = unresolvedRequiredBlocks(blocks, latestVerdicts([]));
    expect(before.map((b) => b.id)).toEqual(["low"]);

    const after = unresolvedRequiredBlocks(
      blocks,
      latestVerdicts([correction({ block_id: "low", corrected_text: "clarified" })]),
    );
    expect(after).toEqual([]);
  });
});

describe("segmentQuestionId", () => {
  it("reads the question reference out of resolved_target", () => {
    expect(segmentQuestionId(segment({ resolved_target: { questionId: "q1" } }))).toBe("q1");
    expect(segmentQuestionId(segment({ resolved_target: {} }))).toBeNull();
  });
});

describe("findConflicts", () => {
  const conflicted = {
    blocks: [block({ id: "b1", linked_question_id: "q1" })],
    segments: [segment({ id: "s1", resolved_target: { questionId: "q1" } })],
  };

  it("flags handwriting and dictation answering the same question", () => {
    const conflicts = findConflicts(conflicted.blocks, conflicted.segments, latestVerdicts([]));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].questionId).toBe("q1");
  });

  it("resolves once either side carries a verdict", () => {
    const conflicts = findConflicts(
      conflicted.blocks,
      conflicted.segments,
      latestVerdicts([correction({ block_id: "b1", corrected_text: "kept" })]),
    );
    expect(conflicts).toEqual([]);
  });

  it("does not flag different questions", () => {
    const conflicts = findConflicts(
      [block({ id: "b1", linked_question_id: "q1" })],
      [segment({ id: "s1", resolved_target: { questionId: "q2" } })],
      latestVerdicts([]),
    );
    expect(conflicts).toEqual([]);
  });
});

describe("verifiedResponses", () => {
  it("applies corrections and drops rejections", () => {
    const out = verifiedResponses(
      [
        block({ id: "b1", text: "misread text", linked_question_id: "q1" }),
        block({ id: "b2", text: "rejected scribble" }),
      ],
      [segment({ id: "s1", transcript: "spoken answer", resolved_target: { questionId: "q2" } })],
      [
        correction({ id: "c1", block_id: "b1", corrected_text: "fixed text" }),
        correction({ id: "c2", block_id: "b2", corrected_text: "" }),
      ],
    );
    expect(out).toHaveLength(2);
    const hand = out.find((r) => r.source === "handwriting");
    expect(hand?.text).toBe("fixed text");
    expect(hand?.linked_question_id).toBe("q1");
    const spoken = out.find((r) => r.source === "dictation");
    expect(spoken?.text).toBe("spoken answer");
    expect(spoken?.linked_question_id).toBe("q2");
  });

  it("keeps uncorrected items verbatim (confirmation by approval)", () => {
    const out = verifiedResponses([block({ id: "b1", text: "as written" })], [], []);
    expect(out[0].text).toBe("as written");
  });

  it("carries anchors from blocks and dictation targets", () => {
    const out = verifiedResponses(
      [block({ id: "b1", linked_anchor: "S2P4" })],
      [segment({ id: "s1", resolved_target: { anchor: "S3P1" } })],
      [],
    );
    expect(out.map((r) => r.linked_anchor)).toEqual(["S2P4", "S3P1"]);
  });
});
