// Verified-response assembly for follow-up/final prompts: latest correction
// wins, rejections drop, corrected_meaning.questionId reassigns or unlinks,
// dictation counts like handwriting, and only known-question items survive.
// Plus the follow-up prompt's provenance guarantees.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  assembleVerifiedResponses,
  buildFinalDocxPrompt,
  buildFinalPptxPrompt,
  buildFollowUpPrompt,
  type AssemblyBlock,
  type AssemblyCorrection,
  type AssemblySegment,
  type FinalArtifactPromptInput,
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

// ----------------------------------------------------------------- final artifact prompts

const FINAL_INPUT: FinalArtifactPromptInput = {
  pieceSlug: "my-piece",
  goal: "Automation and administrative work",
  styleText: "Short declarative sentences.",
  packetBody: "# Findings\n\nEmployment declined.",
  packetAnalysis: { claims: [{ id: "C1" }] },
  verifiedResponses: [{ prompt: "What did you believe?", response: "I thought jobs were safe." }],
  followupSummary: "Second-pass evidence confirmed the decline.",
  studentContributions: [{ kind: "belief", text: "Local offices matter most." }],
};

Deno.test("final docx prompt: output path, design system, and every context block", () => {
  const p = buildFinalDocxPrompt(FINAL_INPUT);
  assert(p.includes("pieces/my-piece/final/document.docx"));
  // Design rules the sample suite (tests/office-artifacts.test.ts) verifies.
  assert(p.includes("US Letter page"));
  assert(p.includes("real Word paragraph styles"));
  assert(p.includes("Heading 1"));
  assert(p.includes("page number"));
  assert(p.includes("core properties"));
  assert(p.includes("alt text"));
  assert(p.includes("grayscale"));
  // Context blocks arrive verbatim, including student contributions.
  assert(p.includes("Short declarative sentences."));
  assert(p.includes("I thought jobs were safe."));
  assert(p.includes("- (belief) Local offices matter most."));
  assert(p.includes("Employment declined."));
  assert(p.includes("Second-pass evidence confirmed the decline."));
  assert(p.includes('final-docx(my-piece)'));
});

Deno.test("final pptx prompt: output path, slide design system, and every context block", () => {
  const p = buildFinalPptxPrompt(FINAL_INPUT);
  assert(p.includes("pieces/my-piece/final/presentation.pptx"));
  assert(p.includes("8–12 slides"));
  assert(p.includes("16:9"));
  assert(p.includes("speaker notes"));
  assert(p.includes("Slide numbers"));
  assert(p.includes("Grayscale-safe"));
  assert(p.includes("Nothing below 11pt"));
  assert(p.includes("core properties"));
  assert(p.includes("- (belief) Local offices matter most."));
  assert(p.includes("I thought jobs were safe."));
  assert(p.includes('final-pptx(my-piece)'));
});

Deno.test("final prompts: empty context degrades to explicit placeholders, never blanks", () => {
  const empty: FinalArtifactPromptInput = {
    pieceSlug: "p",
    goal: null,
    styleText: "",
    packetBody: null,
    packetAnalysis: null,
    verifiedResponses: [],
    followupSummary: null,
    studentContributions: [],
  };
  for (const p of [buildFinalDocxPrompt(empty), buildFinalPptxPrompt(empty)]) {
    assert(p.includes("(none — infer from the packet)"));
    assert(p.includes("(neutral academic register)"));
    assert(p.includes("STUDENT_RESPONSES: (none captured yet)"));
    assert(p.includes("(missing)"));
  }
});
