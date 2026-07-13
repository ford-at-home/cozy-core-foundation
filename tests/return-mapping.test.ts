// Dictation segmentation: the transcript-splitting rules the verification
// screen depends on (docs/research-workflow/04-return-and-recognition.md).

import { describe, expect, it } from "vitest";
import { describeTarget, segmentDictation } from "../src/lib/return-mapping";

describe("segmentDictation", () => {
  it("returns nothing for an empty transcript", () => {
    expect(segmentDictation("")).toEqual([]);
    expect(segmentDictation("   ")).toEqual([]);
  });

  it("keeps an unreferenced transcript as one unplaced segment", () => {
    const segs = segmentDictation("I mostly agreed with the findings but the second one felt thin.");
    expect(segs).toHaveLength(1);
    expect(segs[0].target).toBeNull();
  });

  it("splits at question references and resolves numbers", () => {
    const segs = segmentDictation(
      "Question 2: the local data matched. Question 3, I couldn't verify the source.",
    );
    expect(segs).toHaveLength(2);
    expect(segs[0].target).toEqual({ question: 2 });
    expect(segs[1].target).toEqual({ question: 3 });
    expect(segs[0].transcript).toContain("local data matched");
  });

  it("understands spoken number words", () => {
    const segs = segmentDictation("Question two: yes. Page three, this diagram is wrong.");
    expect(segs[0].target).toEqual({ question: 2 });
    expect(segs[1].target).toEqual({ page: 3 });
  });

  it("merges adjacent references into one target (Page 3, Question 2)", () => {
    const segs = segmentDictation("Page 3, question 2: my county saw the opposite trend.");
    expect(segs).toHaveLength(1);
    expect(segs[0].target).toEqual({ page: 3, question: 2 });
  });

  it("resolves S{n}P{m} anchors, including spoken spacing", () => {
    const segs = segmentDictation("S4P3: tighten. S 2 P 1, cut the aside about naming.");
    expect(segs).toHaveLength(2);
    expect(segs[0].target).toEqual({ anchor: "S4P3" });
    expect(segs[1].target).toEqual({ anchor: "S2P1" });
  });

  it("distinguishes follow-up questions from regular questions", () => {
    const segs = segmentDictation(
      "Follow-up question one: did enrollment actually decline after 2023?",
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].target).toEqual({ followup: 1 });
  });

  it("keeps a preamble before the first reference as an unplaced segment", () => {
    const segs = segmentDictation(
      "Overall this was stronger than I expected. Question 1: I wrote my answer on paper too.",
    );
    expect(segs).toHaveLength(2);
    expect(segs[0].target).toBeNull();
    expect(segs[0].transcript).toContain("stronger than I expected");
    expect(segs[1].target).toEqual({ question: 1 });
  });

  it("handles the abbreviation Q with a number", () => {
    const segs = segmentDictation("Q4: the stakes framing missed renters entirely.");
    expect(segs[0].target).toEqual({ question: 4 });
  });
});

describe("describeTarget", () => {
  it("labels each target kind in plain language", () => {
    expect(describeTarget(null)).toBe("Not placed yet");
    expect(describeTarget({})).toBe("Not placed yet");
    expect(describeTarget({ question: 2 })).toBe("Question 2");
    expect(describeTarget({ page: 3, question: 2 })).toBe("Question 2 · Page 3");
    expect(describeTarget({ anchor: "S4P3" })).toBe("S4P3");
    expect(describeTarget({ followup: 1 })).toBe("Follow-up question 1");
  });
});
