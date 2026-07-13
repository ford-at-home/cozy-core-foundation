// Handwriting-recognition contract tests: prompt content, strict response
// validation (never fabricate, clamp confidence, whitelist types), retake
// messaging, and idempotent/retake-safe persistence.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildRecognitionPrompt,
  parseRecognitionResult,
  persistPageRecognition,
  REVIEW_CONFIDENCE_THRESHOLD,
  retakeMessage,
} from "../_shared/recognition.ts";

// ---------------------------------------------------------------- prompt

Deno.test("recognition prompt: quality gate first, no-fabrication rule, packet context", () => {
  const p = buildRecognitionPrompt({
    packetBody: "# Findings\n\nClaim C1 says…",
    questions: [
      { number: 1, prompt: "How does C1 hold up against the BLS series?" },
      { number: 2, prompt: "What would your county's data show?" },
    ],
    handwritingProfile: "Writes 'w/' for 'with'; loops g and y.",
  });
  assert(p.indexOf("FIRST, judge the photo") < p.indexOf("transcribe every handwritten element"));
  assert(p.includes("NEVER invent text you cannot read"));
  assert(p.includes("Q1: How does C1 hold up"));
  assert(p.includes("Q2: What would your county's data show?"));
  assert(p.includes("Claim C1 says…"));
  assert(p.includes("Writes 'w/' for 'with'"));
  assert(p.includes("blurred, glare, shadow, cropped, skewed"));
});

Deno.test("recognition prompt omits the profile section when absent", () => {
  const p = buildRecognitionPrompt({ packetBody: "b", questions: [] });
  assert(!p.includes("handwriting profile"));
});

// ---------------------------------------------------------------- parsing

function goodResponse(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    page_number: 3,
    quality: { ok: true, problems: [] },
    blocks: [
      {
        position: 1,
        location: "response area under Q1",
        text: "The finding matched my county's numbers",
        confidence: 0.92,
        annotation_type: "response",
        interpretation: null,
        interpretation_confidence: null,
        question_number: 1,
        linked_anchor: null,
      },
      {
        position: 2,
        location: "left margin beside S4P2",
        text: "check this vs 2024 data",
        confidence: 0.55,
        annotation_type: "margin_note",
        interpretation: "wants the claim verified against newer data",
        interpretation_confidence: 0.6,
        question_number: null,
        linked_anchor: "S4P2",
      },
    ],
    ...over,
  });
}

Deno.test("parseRecognitionResult accepts a valid response", () => {
  const out = parseRecognitionResult(goodResponse());
  assertEquals(out.page_number, 3);
  assert(out.quality.ok);
  assertEquals(out.blocks.length, 2);
  assertEquals(out.blocks[0].question_number, 1);
  assertEquals(out.blocks[1].linked_anchor, "S4P2");
  assert(out.blocks[1].confidence < REVIEW_CONFIDENCE_THRESHOLD);
});

Deno.test("parseRecognitionResult strips a markdown fence", () => {
  const out = parseRecognitionResult("```json\n" + goodResponse() + "\n```");
  assertEquals(out.blocks.length, 2);
});

Deno.test("parseRecognitionResult: rejected photo yields named problems and no blocks", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      page_number: null,
      quality: { ok: false, problems: ["glare", "cropped", "made_up_problem"] },
      blocks: [{ position: 1, text: "should be dropped", confidence: 0.9 }],
    }),
  );
  assert(!out.quality.ok);
  assertEquals(out.quality.problems, ["glare", "cropped"]); // unknown problem filtered
  assertEquals(out.blocks.length, 0); // never read handwriting from a bad photo
});

Deno.test("parseRecognitionResult: not-ok with no named problem still fails the gate", () => {
  const out = parseRecognitionResult(
    JSON.stringify({ page_number: 1, quality: { ok: false, problems: [] }, blocks: [] }),
  );
  assert(!out.quality.ok);
  assert(out.quality.problems.length > 0);
});

Deno.test("parseRecognitionResult drops malformed blocks, clamps confidence, coerces types", () => {
  const out = parseRecognitionResult(
    JSON.stringify({
      page_number: 0, // invalid → null
      quality: { ok: true, problems: [] },
      blocks: [
        { text: "", confidence: 0.9 }, // empty text dropped
        { text: "ok", confidence: "not-a-number" }, // bad confidence dropped
        { text: "clamped", confidence: 4, annotation_type: "nonsense", linked_anchor: "S4" },
        { text: "fine", confidence: 0.8, annotation_type: "shorthand", linked_anchor: "S2P9" },
      ],
    }),
  );
  assertEquals(out.page_number, null);
  assertEquals(out.blocks.length, 2);
  assertEquals(out.blocks[0].confidence, 1); // clamped to [0,1]
  assertEquals(out.blocks[0].annotation_type, "other"); // unknown type coerced
  assertEquals(out.blocks[0].linked_anchor, null); // "S4" is not a valid anchor
  assertEquals(out.blocks[1].linked_anchor, "S2P9");
  // Positions renumbered in reading order.
  assertEquals(
    out.blocks.map((b) => b.position),
    [1, 2],
  );
});

Deno.test("parseRecognitionResult throws on malformed documents", () => {
  assertThrows(() => parseRecognitionResult("not json"));
  assertThrows(() => parseRecognitionResult(JSON.stringify([1, 2])));
});

// ---------------------------------------------------------------- retakes

Deno.test("retakeMessage names each specific problem", () => {
  const m = retakeMessage(["glare", "cropped"]);
  assert(m.includes("light is reflecting"));
  assert(m.includes("fit the whole page"));
  assert(m.includes("dictate"));
});

// ------------------------------------------------------------- persistence

type Call = { table: string; op: string; payload?: unknown; opts?: unknown };

function fakeAdmin() {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      return {
        upsert(payload: unknown, opts: unknown) {
          calls.push({ table, op: "upsert", payload, opts });
          return {
            select(_c: string) {
              return {
                single() {
                  return Promise.resolve({ data: { id: `${table}-id` }, error: null });
                },
              };
            },
            // Blocks upsert is awaited directly (no .select chain).
            then(resolve: (v: { error: null }) => void) {
              resolve({ error: null });
            },
          };
        },
        delete() {
          return {
            eq(_k: string, _v: unknown) {
              calls.push({ table, op: "delete" });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

Deno.test("persistPageRecognition upserts the page, replaces blocks, links questions", async () => {
  const { admin, calls } = fakeAdmin();
  const outcome = parseRecognitionResult(goodResponse());
  const res = await persistPageRecognition(admin, {
    returnId: "ret-1",
    userId: "user-1",
    storagePath: "user-1/packet-1/page-3.jpg",
    outcome,
    questionIdsByNumber: new Map([[1, "q-uuid-1"]]),
  });
  assertEquals(res.status, "recognized");

  const pageUpsert = calls.find((c) => c.table === "page_images" && c.op === "upsert");
  assert(pageUpsert, "page image must be upserted");
  assertEquals(
    (pageUpsert!.opts as { onConflict: string }).onConflict,
    "return_id,storage_path",
    "page upsert must be idempotent on (return_id, storage_path)",
  );

  // Retake safety: stale machine-read blocks are deleted before re-insert.
  assert(calls.some((c) => c.table === "recognized_blocks" && c.op === "delete"));

  const blockUpsert = calls.find((c) => c.table === "recognized_blocks" && c.op === "upsert");
  assert(blockUpsert, "blocks must be written");
  const rows = blockUpsert!.payload as Array<Record<string, unknown>>;
  assertEquals(rows.length, 2);
  assertEquals(rows[0].linked_question_id, "q-uuid-1"); // Q1 resolved to its uuid
  assertEquals(rows[1].linked_question_id, null);
  assertEquals(rows[1].linked_anchor, "S4P2");
});

Deno.test("persistPageRecognition marks a rejected photo without writing blocks", async () => {
  const { admin, calls } = fakeAdmin();
  const outcome = parseRecognitionResult(
    JSON.stringify({ page_number: null, quality: { ok: false, problems: ["blurred"] }, blocks: [] }),
  );
  const res = await persistPageRecognition(admin, {
    returnId: "ret-1",
    userId: "user-1",
    storagePath: "user-1/packet-1/page-4.jpg",
    outcome,
    questionIdsByNumber: new Map(),
  });
  assertEquals(res.status, "rejected");
  assert(!calls.some((c) => c.table === "recognized_blocks" && c.op === "upsert"));
});
