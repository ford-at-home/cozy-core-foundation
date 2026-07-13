// Research-packet contract tests: the packet prompt, questions/analysis
// validation, idempotent persistence, and the research→packet chain.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildPacketPrompt } from "../_shared/prompt.ts";
import {
  isProhibitedGeneric,
  parsePacketAnalysis,
  parsePacketQuestions,
  persistPacketResult,
} from "../_shared/packet.ts";

// ---------------------------------------------------------------- prompt

Deno.test("packet prompt: analysis before questions, questions before body", () => {
  const p = buildPacketPrompt({
    pieceSlug: "packet-abc123",
    research: "Some research with a link https://example.com/a",
    goal: "Undergraduate sociology seminar",
  });
  const a = p.indexOf("PHASE A");
  const b = p.indexOf("PHASE B");
  const c = p.indexOf("PHASE C");
  assert(a > -1 && b > a && c > b, "phases must be ordered A → B → C");
  assert(p.includes("pieces/packet-abc123/packet/analysis.json"));
  assert(p.includes("pieces/packet-abc123/packet/questions.json"));
  assert(p.includes("pieces/packet-abc123/packet/packet.md"));
  assert(p.includes("https://example.com/a"));
  assert(p.includes("Undergraduate sociology seminar"));
  assert(p.includes("Do NOT open a pull request"));
});

Deno.test("packet prompt embeds the prohibited generic patterns and the rubric", () => {
  const p = buildPacketPrompt({ pieceSlug: "s", research: "r", goal: null });
  assert(p.includes("What assumptions are being made?"));
  assert(p.includes("Why does this matter?"));
  assert(p.includes("UNRELATED topic"));
  assert(p.includes("research specificity"));
  assert(p.includes("below 9 of 12"));
  assert(p.includes('EXACTLY ONE\n  question has function "followup"'));
  // The packet is a research artifact — no voice/style enters this prompt.
  assert(!p.includes("styleText"));
});

Deno.test("packet prompt: markup protocol referenced, questions excluded from body", () => {
  const p = buildPacketPrompt({ pieceSlug: "s", research: "r", goal: null });
  assert(p.includes("contract/references/MARKUP.md"));
  assert(p.includes("Do NOT\ninclude the questions"));
});

// ----------------------------------------------------------- questions.json

const GOOD_PROMPT =
  "The report connects rising adoption of automated review with declining employment in " +
  "administrative occupations (C3). Which two features of the BLS series should be checked, " +
  "and how could each distort the conclusion?";

function q(over: Partial<Record<string, unknown>> = {}) {
  return {
    position: 1,
    function: "evidence_integrity",
    claim_ref: "C3",
    prompt: GOOD_PROMPT,
    guidance: null,
    response_space: "lines_5",
    ...over,
  };
}

Deno.test("parsePacketQuestions accepts a valid set and keeps followup last", () => {
  const raw = JSON.stringify({
    questions: [
      q({ position: 2, function: "followup", prompt: GOOD_PROMPT + " What remains unresolved?" }),
      q({ position: 1 }),
      q({ position: 3, function: "stakes", claim_ref: "C1" }),
    ],
  });
  const { questions, rejected } = parsePacketQuestions(raw);
  assertEquals(rejected.length, 0);
  assertEquals(questions.length, 3);
  assertEquals(
    questions.map((x) => x.position),
    [1, 2, 3],
  );
  assertEquals(questions[2].function, "followup");
});

Deno.test("parsePacketQuestions rejects generic, short, and unref'd questions", () => {
  const raw = JSON.stringify({
    questions: [
      q(),
      q({ position: 2, prompt: "What assumptions are being made?" }),
      q({ position: 3, prompt: "Too short." }),
      q({ position: 4, claim_ref: "" }),
      q({ position: 5, function: "not_a_function" }),
    ],
  });
  const { questions, rejected } = parsePacketQuestions(raw);
  assertEquals(questions.length, 1);
  assertEquals(rejected.length, 4);
  assert(rejected.some((r) => r.reason.includes("generic")));
  assert(rejected.some((r) => r.reason.includes("claim_ref")));
});

Deno.test("parsePacketQuestions folds extra followup sections out", () => {
  const raw = JSON.stringify({
    questions: [q({ position: 1, function: "followup" }), q({ position: 2, function: "followup" })],
  });
  const { questions, rejected } = parsePacketQuestions(raw);
  assertEquals(questions.length, 1);
  assertEquals(rejected.length, 1);
});

Deno.test("parsePacketQuestions throws on malformed documents", () => {
  assertThrows(() => parsePacketQuestions("not json"));
  assertThrows(() => parsePacketQuestions(JSON.stringify({ nope: true })));
});

Deno.test("isProhibitedGeneric matches regardless of punctuation and case", () => {
  assert(isProhibitedGeneric("What assumptions are being made?"));
  assert(isProhibitedGeneric("why does this matter"));
  assert(!isProhibitedGeneric(GOOD_PROMPT));
});

// ------------------------------------------------------------ analysis.json

Deno.test("parsePacketAnalysis validates shape", () => {
  const good = JSON.stringify({ inquiry: { question: "?" }, claims: [{ id: "C1" }] });
  const parsed = parsePacketAnalysis(good);
  assert(Array.isArray(parsed.claims));
  assertThrows(() => parsePacketAnalysis("nope"));
  assertThrows(() => parsePacketAnalysis(JSON.stringify({ claims: [] })));
  assertThrows(() => parsePacketAnalysis(JSON.stringify([1, 2])));
});

// ------------------------------------------------------------- persistence

type UpsertCall = { table: string; payload: unknown; opts: Record<string, unknown> };

function fakeAdmin(existing: { packetId?: string }) {
  const upserts: UpsertCall[] = [];
  const events: unknown[] = [];
  const admin = {
    from(table: string) {
      return {
        upsert(payload: unknown, opts: Record<string, unknown>) {
          upserts.push({ table, payload, opts });
          return Promise.resolve({ error: null });
        },
        select(_cols: string) {
          return {
            eq(_k: string, _v: unknown) {
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: existing.packetId ? { id: existing.packetId } : null,
                    error: null,
                  });
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          events.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, upserts, events };
}

const RUN = { id: "run-1", user_id: "user-1", piece_id: "piece-1" };

function resultWith(files: Array<{ name: string; content: string }>) {
  return { channels: [{ channel: "packet", files }] };
}

Deno.test("persistPacketResult upserts packet + questions with ignore-duplicates", async () => {
  const { admin, upserts, events } = fakeAdmin({ packetId: "packet-1" });
  const result = resultWith([
    { name: "post.md", content: "# Packet" },
    {
      name: "analysis.json",
      content: JSON.stringify({ inquiry: {}, claims: [{ id: "C1", text: "claim" }] }),
    },
    {
      name: "questions.json",
      content: JSON.stringify({ questions: [q(), q({ position: 2, function: "followup" })] }),
    },
  ]);

  await persistPacketResult(admin, RUN, result);

  const packetUpsert = upserts.find((u) => u.table === "packets");
  assert(packetUpsert, "packet row upserted");
  assertEquals(packetUpsert!.opts.onConflict, "run_id");
  assertEquals(packetUpsert!.opts.ignoreDuplicates, true);

  const qUpsert = upserts.find((u) => u.table === "packet_questions");
  assert(qUpsert, "question rows upserted");
  assertEquals(qUpsert!.opts.onConflict, "packet_id,position");
  assertEquals(qUpsert!.opts.ignoreDuplicates, true);
  const rows = qUpsert!.payload as Array<Record<string, unknown>>;
  assertEquals(rows.length, 2);
  assertEquals(rows[0].packet_id, "packet-1");
  assertEquals(rows[0].source, "generated");

  // Clean result: nothing to flag.
  assertEquals(events.length, 0);
});

Deno.test("persistPacketResult is a safe no-op shape on redelivery", async () => {
  // Second delivery: the packet row already exists; ignoreDuplicates means
  // neither the packet nor the question rows are overwritten.
  const { admin, upserts } = fakeAdmin({ packetId: "packet-1" });
  const result = resultWith([
    { name: "post.md", content: "# Packet" },
    {
      name: "analysis.json",
      content: JSON.stringify({ claims: [{ id: "C1" }] }),
    },
    { name: "questions.json", content: JSON.stringify({ questions: [q()] }) },
  ]);
  await persistPacketResult(admin, RUN, result);
  await persistPacketResult(admin, RUN, result);
  for (const u of upserts) {
    assertEquals(u.opts.ignoreDuplicates, true, `${u.table} must never clobber existing rows`);
  }
});

Deno.test(
  "persistPacketResult flags missing/invalid sidecars but still persists the packet",
  async () => {
    const { admin, upserts, events } = fakeAdmin({ packetId: "packet-1" });
    const result = resultWith([{ name: "post.md", content: "# Packet" }]);
    await persistPacketResult(admin, RUN, result);
    assert(upserts.some((u) => u.table === "packets"));
    assert(!upserts.some((u) => u.table === "packet_questions"));
    assertEquals(events.length, 1);
    const payload = (events[0] as Record<string, unknown>).payload as Record<string, unknown>;
    assert(Array.isArray(payload.problems) && (payload.problems as string[]).length === 2);
  },
);
