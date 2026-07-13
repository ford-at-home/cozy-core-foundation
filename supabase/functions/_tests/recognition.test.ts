// Handwriting-recognition contract tests: the prompt's non-negotiables, the
// parser's fabrication guards, and the block → row mapping (question
// linking, attempt versioning inputs).

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  blocksToRows,
  buildRecognitionPrompt,
  parseRecognitionResult,
} from "../_shared/recognition.ts";

const QUESTIONS = [
  { id: "q-one", position: 1, prompt: "How does the 2019 audit affect claim C2?" },
  { id: "q-two", position: 2, prompt: "Which stakeholder does source S3 leave out?" },
];

// ---------------------------------------------------------------- prompt

Deno.test("prompt: includes questions, forbids fabrication, asks for JSON", () => {
  const p = buildRecognitionPrompt(QUESTIONS);
  assert(p.includes("Q1: How does the 2019 audit affect claim C2?"));
  assert(p.includes("Q2: Which stakeholder does source S3 leave out?"));
  assert(p.includes("NEVER guess or invent words"));
  assert(p.includes("Do not transcribe printed text"));
  assert(p.includes('"quality"'));
  assert(p.includes("F.1, F.2, F.3"));
});

// ---------------------------------------------------------------- parser

Deno.test("parser: valid document parses with blocks in order", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: 3,
      blocks: [
        {
          kind: "response",
          text: "The audit shows the data was incomplete",
          confidence: 0.91,
          question_position: 1,
        },
        { kind: "annotation", text: "", annotation_type: "circle", location: { area: "S2P1" } },
      ],
    }),
  );
  assertEquals(out.page_number, 3);
  assertEquals(out.blocks.length, 2);
  assertEquals(out.blocks[0].position, 0);
  assertEquals(out.blocks[1].kind, "annotation");
});

Deno.test("parser: tolerates a fenced code block", () => {
  const out = parseRecognitionResult(
    '```json\n{"quality":{"ok":true,"issues":[]},"page_number":null,"blocks":[]}\n```',
  );
  assertEquals(out.blocks.length, 0);
});

Deno.test("parser: throws on non-JSON (page marked failed, never guessed)", () => {
  assertThrows(() => parseRecognitionResult("I could not read this page, sorry!"));
  assertThrows(() => parseRecognitionResult("[1,2,3]"));
});

Deno.test("parser: empty text forces null confidence (no phantom certainty)", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: null,
      blocks: [{ kind: "response", text: "", confidence: 0.95, location: { area: "q1" } }],
    }),
  );
  assertEquals(out.blocks.length, 1);
  assertEquals(out.blocks[0].confidence, null);
  assertEquals(out.blocks[0].text, "");
});

Deno.test("parser: text without confidence floors to 0 so review must see it", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: null,
      blocks: [{ kind: "response", text: "maybe this", confidence: null }],
    }),
  );
  assertEquals(out.blocks[0].confidence, 0);
});

Deno.test("parser: confidence clamped to [0,1]", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: null,
      blocks: [
        { kind: "response", text: "a", confidence: 7 },
        { kind: "response", text: "b", confidence: -2 },
      ],
    }),
  );
  assertEquals(out.blocks[0].confidence, 1);
  assertEquals(out.blocks[1].confidence, 0);
});

Deno.test("parser: information-free blocks are dropped", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: null,
      blocks: [{ kind: "note", text: "", confidence: null }],
    }),
  );
  assertEquals(out.blocks.length, 0);
});

Deno.test("parser: quality issues normalize and ok defaults from issues", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      quality: { issues: [{ code: "blur" }, { bogus: true }] },
      page_number: null,
      blocks: [],
    }),
  );
  assertEquals(out.quality.ok, false);
  assertEquals(out.quality.issues, [{ code: "blur", message: "blur" }]);
});

// ---------------------------------------------------------------- rows

Deno.test("rows: question positions resolve to packet question ids", () => {
  const parsed = parseRecognitionResult(
    JSON.stringify({
      quality: { ok: true, issues: [] },
      page_number: 2,
      blocks: [
        { kind: "response", text: "answer one", confidence: 0.8, question_position: 1 },
        { kind: "response", text: "answer nine", confidence: 0.8, question_position: 9 },
        { kind: "followup", text: "what about X?", confidence: 0.7, followup_index: 2 },
      ],
    }),
  );
  const rows = blocksToRows({
    pageImageId: "img-1",
    returnId: "ret-1",
    userId: "u-1",
    attempt: 2,
    blocks: parsed.blocks,
    questions: QUESTIONS,
  });
  assertEquals(rows.length, 3);
  assertEquals(rows[0].linked_question_id, "q-one");
  assertEquals(rows[1].linked_question_id, null); // unknown Q stays unlinked
  assertEquals(rows[2].linked_question_id, null);
  assertEquals((rows[2].location as Record<string, unknown>).followup_index, 2);
  // Attempt versioning + unique (page, attempt, position) inputs.
  for (const [i, r] of rows.entries()) {
    assertEquals(r.attempt, 2);
    assertEquals(r.position, i);
    assertEquals(r.page_image_id, "img-1");
  }
});
