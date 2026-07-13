// Verified-response assembly for follow-up/final prompts: latest correction
// wins, rejections drop, corrected_meaning.questionId reassigns or unlinks,
// dictation counts like handwriting, and only known-question items survive.
// Plus the follow-up prompt's provenance guarantees.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  assembleVerifiedResponses,
  buildFollowUpPrompt,
  type AssemblyBlock,
  type AssemblyCorrection,
  type AssemblySegment,
} from "../_shared/followup-final.ts";

const QUESTIONS = [
  { id: "q1", prompt: "What did you believe before reading?" },
  { id: "q2", prompt: "Which claim has the weakest evidence?" },
];

const block = (over: Partial<AssemblyBlock>): AssemblyBlock => ({
  id: "b1",
  text: "raw handwriting",
  linked_question_id: "q1",
  ...over,
});

const segment = (over: Partial<AssemblySegment>): AssemblySegment => ({
  id: "s1",
  transcript: "spoken answer",
  resolved_target: { questionId: "q2" },
  ...over,
});

const correction = (over: Partial<AssemblyCorrection>): AssemblyCorrection => ({
  block_id: null,
  segment_id: null,
  corrected_text: "",
  corrected_meaning: null,
  verified_at: "2026-07-13T01:00:00Z",
  ...over,
});

Deno.test("assembly: uncorrected blocks and segments pass through with their linkage", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({})],
    segments: [segment({})],
    corrections: [],
  });
  assertEquals(out, [
    { prompt: QUESTIONS[0].prompt, response: "raw handwriting" },
    { prompt: QUESTIONS[1].prompt, response: "spoken answer" },
  ]);
});

Deno.test("assembly: corrections override the recognized text", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({})],
    segments: [],
    corrections: [correction({ block_id: "b1", corrected_text: "what I actually wrote" })],
  });
  assertEquals(out, [{ prompt: QUESTIONS[0].prompt, response: "what I actually wrote" }]);
});

Deno.test("assembly: the latest correction per item wins", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({})],
    segments: [],
    corrections: [
      correction({ block_id: "b1", corrected_text: "second", verified_at: "2026-07-13T02:00:00Z" }),
      correction({ block_id: "b1", corrected_text: "first", verified_at: "2026-07-13T01:00:00Z" }),
    ],
  });
  assertEquals(out[0].response, "second");
});

Deno.test("assembly: an empty correction is a rejection — the item is dropped", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({})],
    segments: [segment({})],
    corrections: [
      correction({ block_id: "b1", corrected_text: "" }),
      correction({ segment_id: "s1", corrected_text: "  " }),
    ],
  });
  assertEquals(out, []);
});

Deno.test("assembly: corrected_meaning.questionId reassigns the target question", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({ linked_question_id: "q1" })],
    segments: [],
    corrections: [
      correction({
        block_id: "b1",
        corrected_text: "moved answer",
        corrected_meaning: { questionId: "q2" },
      }),
    ],
  });
  assertEquals(out, [{ prompt: QUESTIONS[1].prompt, response: "moved answer" }]);
});

Deno.test(
  "assembly: corrected_meaning.questionId=null unlinks (item drops without a question)",
  () => {
    const out = assembleVerifiedResponses({
      questions: QUESTIONS,
      blocks: [block({})],
      segments: [],
      corrections: [
        correction({
          block_id: "b1",
          corrected_text: "a general note",
          corrected_meaning: { questionId: null },
        }),
      ],
    });
    assertEquals(out, []);
  },
);

Deno.test("assembly: items pointing at unknown questions are skipped", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [block({ linked_question_id: "q-elsewhere" })],
    segments: [segment({ resolved_target: {} })],
    corrections: [],
  });
  assertEquals(out, []);
});

Deno.test("assembly: multiple answers to one question are joined in question order", () => {
  const out = assembleVerifiedResponses({
    questions: QUESTIONS,
    blocks: [
      block({ id: "b1", text: "part one", linked_question_id: "q2" }),
      block({ id: "b2", text: "part two", linked_question_id: "q2" }),
    ],
    segments: [],
    corrections: [],
  });
  assertEquals(out, [{ prompt: QUESTIONS[1].prompt, response: "part one\npart two" }]);
});

Deno.test(
  "followup prompt: verbatim approved questions, immutability, and new-directory rule",
  () => {
    const p = buildFollowUpPrompt({
      pieceSlug: "my-piece",
      priorVersion: 1,
      priorPacketAnalysis: { claims: [] },
      approvedQuestions: [{ position: 1, text: "Did X change after Y?" }],
      verifiedResponses: [{ prompt: "Q", response: "A" }],
      studentContributions: [],
    });
    assert(p.includes("1. Did X change after Y?"));
    assert(p.includes("pieces/my-piece/followup/"));
    assert(p.includes("NOT allowed to modify the prior packet"));
    assert(p.includes("v2 research"));
  },
);
