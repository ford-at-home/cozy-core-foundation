// Handwriting-recognition contract tests: prompt construction (question
// context + no-fabrication rules), model-output validation (fabrication
// guards, confidence clamping, quality gate), and block → row mapping
// (question-position resolution).

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  LOW_CONFIDENCE_THRESHOLD,
  blocksToRows,
  buildRecognitionPrompt,
  parseRecognitionResult,
  type RecognitionQuestionContext,
} from "../_shared/recognition.ts";

const QUESTIONS: RecognitionQuestionContext[] = [
  { id: "q-aaa", position: 1, prompt: "What did you believe before reading?" },
  { id: "q-bbb", position: 2, prompt: "Which claim has the weakest evidence?" },
];

// ---------------------------------------------------------------- prompt

Deno.test("recognition prompt: carries the packet questions and the no-fabrication rule", () => {
  const p = buildRecognitionPrompt(QUESTIONS);
  assert(p.includes("Q1 (id q-aaa): What did you believe before reading?"));
  assert(p.includes("Q2 (id q-bbb): Which claim has the weakest evidence?"));
  assert(p.includes("NEVER invent"));
  assert(p.includes("question_position"));
  assert(p.includes("STRICT JSON"));
});

Deno.test("recognition prompt: survives an empty question list", () => {
  const p = buildRecognitionPrompt([]);
  assert(p.includes("no questions available"));
});

// ---------------------------------------------------------------- parsing

Deno.test("parse: valid payload with quality, page number, and blocks", () => {
  const result = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: 3,
      blocks: [
        {
          text: "I assumed remote work reduced output.",
          confidence: 0.92,
          annotation_type: "response",
          location: { description: "ruled space under Q1" },
          question_position: 1,
          anchor: null,
          interpretation_confidence: 0.9,
        },
      ],
    }),
  );
  assertEquals(result.quality.ok, true);
  assertEquals(result.page_number, 3);
  assertEquals(result.blocks.length, 1);
  assertEquals(result.blocks[0].question_position, 1);
});

Deno.test("parse: throws on non-JSON output", () => {
  assertThrows(() => parseRecognitionResult("the page shows..."), Error, "not valid JSON");
});

Deno.test("parse: drops information-free blocks (fabrication guard)", () => {
  const result = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      blocks: [
        { text: "   ", confidence: 0.9, annotation_type: "response" },
        { text: "real words", confidence: 0.7, annotation_type: "margin_note" },
      ],
    }),
  );
  assertEquals(result.blocks.length, 1);
  assertEquals(result.blocks[0].text, "real words");
});

Deno.test("parse: clamps confidence into [0,1] and defaults bad annotation types", () => {
  const result = parseRecognitionResult(
    JSON.stringify({
      blocks: [
        { text: "a", confidence: 7, annotation_type: "scribble" },
        { text: "b", confidence: -2, annotation_type: "underline" },
      ],
    }),
  );
  assertEquals(result.blocks[0].confidence, 1);
  assertEquals(result.blocks[0].annotation_type, "other");
  assertEquals(result.blocks[1].confidence, 0);
});

Deno.test("parse: quality gate carries specific retake reasons", () => {
  const result = parseRecognitionResult(
    JSON.stringify({
      quality: {
        ok: false,
        issues: [{ code: "cropped", message: "The bottom third is cut off." }],
      },
      blocks: [],
    }),
  );
  assertEquals(result.quality.ok, false);
  assertEquals(result.quality.issues[0].code, "cropped");
});

Deno.test("parse: low-confidence threshold is between 0 and 1", () => {
  assert(LOW_CONFIDENCE_THRESHOLD > 0 && LOW_CONFIDENCE_THRESHOLD < 1);
});

// ---------------------------------------------------------------- rows

Deno.test("rows: resolves question_position to the packet question id", () => {
  const parsed = parseRecognitionResult(
    JSON.stringify({
      blocks: [
        { text: "answer one", confidence: 0.8, annotation_type: "response", question_position: 2 },
        { text: "loose note", confidence: 0.6, annotation_type: "margin_note" },
        { text: "ghost", confidence: 0.5, annotation_type: "response", question_position: 9 },
      ],
    }),
  );
  const rows = blocksToRows(parsed.blocks, {
    pageImageId: "img-1",
    userId: "user-1",
    questions: QUESTIONS,
  });
  assertEquals(rows[0].linked_question_id, "q-bbb");
  assertEquals(rows[1].linked_question_id, null);
  // Unknown positions never link to a random question.
  assertEquals(rows[2].linked_question_id, null);
  assertEquals(rows[0].page_image_id, "img-1");
  assertEquals(rows[0].user_id, "user-1");
});

Deno.test("rows: preserves anchors and interpretation confidence", () => {
  const parsed = parseRecognitionResult(
    JSON.stringify({
      blocks: [
        {
          text: "research further",
          confidence: 0.75,
          annotation_type: "margin_note",
          anchor: "S2P4",
          interpretation_confidence: 0.55,
        },
      ],
    }),
  );
  const rows = blocksToRows(parsed.blocks, {
    pageImageId: "img-1",
    userId: "user-1",
    questions: [],
  });
  assertEquals(rows[0].linked_anchor, "S2P4");
  assertEquals(rows[0].interpretation_confidence, 0.55);
});
