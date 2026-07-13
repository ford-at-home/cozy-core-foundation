// Follow-up research contract tests (Phase 5): the follow-up query, the
// consensual refinement parsing, the revised-packet prompt, and the
// version/supersedes persistence path.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  MAX_FOLLOWUP_QUESTIONS,
  buildFollowupQuery,
  buildRefinementPrompt,
  buildRevisedPacketPrompt,
  parseRefinementResult,
} from "../_shared/followup.ts";
import { persistPacketResult } from "../_shared/packet.ts";

const QUESTIONS = [
  { position: 1, text: "Did community-college enrollment actually decline after 2023?" },
  { position: 2, text: "What did the GAO audit find about the sampling method?" },
];

Deno.test("followup query answers the student's questions, not the whole topic", () => {
  const q = buildFollowupQuery({
    topic: "Automation and administrative employment",
    questions: QUESTIONS,
    originalReport: "# Report\nOriginal findings…",
  });
  assert(q.includes("FOLLOW-UP research pass"));
  assert(q.includes("do not re-research the whole topic"));
  assert(q.includes("1. Did community-college enrollment actually decline after 2023?"));
  assert(q.includes("CONFIRMS, CONTRADICTS, or CHANGES"));
  assert(q.includes("Original findings…"));
  assert(q.includes("source URL inline"));
  // Dead ends are valid answers — the query must say so.
  assert(q.includes("documented dead end"));
});

Deno.test("MAX_FOLLOWUP_QUESTIONS is the spec's three", () => {
  assertEquals(MAX_FOLLOWUP_QUESTIONS, 3);
});

// ------------------------------------------------------------- refinement

Deno.test("refinement prompt preserves intent and is consensual by design", () => {
  const p = buildRefinementPrompt(QUESTIONS);
  assert(p.includes("NEVER change what the student is asking about"));
  assert(p.includes("1. Did community-college enrollment actually decline after 2023?"));
});

Deno.test("parseRefinementResult validates and drops malformed entries", () => {
  const out = parseRefinementResult(
    JSON.stringify({
      suggestions: [
        { position: 1, suggested: "Sharper version", reason: "names the dataset" },
        { position: "x", suggested: "bad position" },
        { position: 2, suggested: "   " },
        { position: 2, suggested: "Fine", reason: null },
      ],
    }),
  );
  assertEquals(out.length, 2);
  assertEquals(out[0], { position: 1, suggested: "Sharper version", reason: "names the dataset" });
  assertEquals(out[1], { position: 2, suggested: "Fine", reason: null });
});

Deno.test("parseRefinementResult returns empty on garbage (refinement is best-effort)", () => {
  assertEquals(parseRefinementResult("not json"), []);
  assertEquals(parseRefinementResult(JSON.stringify({ nope: 1 })), []);
});

// --------------------------------------------------------- revised packet

Deno.test("revised packet prompt: What changed first, same file contract, one document", () => {
  const p = buildRevisedPacketPrompt({
    pieceSlug: "packet-abc123",
    followupReport: "## Q1 findings\nEnrollment fell 4% ([src](https://x))",
    originalPacketBody: "# Original packet body",
    questions: QUESTIONS,
    version: 2,
  });
  assert(p.includes("packet v2"));
  assert(p.includes('"What changed" — FIRST section'));
  assert(p.includes("pieces/packet-abc123/packet/analysis.json"));
  assert(p.includes("pieces/packet-abc123/packet/questions.json"));
  assert(p.includes("pieces/packet-abc123/packet/packet.md"));
  assert(p.includes('{ "questions": [] }'), "an empty questions array must be valid");
  assert(p.includes("Do NOT open a pull request"));
  assert(p.includes("Enrollment fell 4%"));
  assert(p.includes("# Original packet body"));
  // No render-strategy choice anywhere: one full document.
  assert(!p.toLowerCase().includes("addendum"));
});

// ------------------------------------------------- version + supersedes

type Call = { table: string; op: string; payload?: unknown; opts?: unknown; filters: unknown[] };

function fakeAdmin() {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const filters: unknown[] = [];
      const chain: any = {
        upsert(payload: unknown, opts: unknown) {
          calls.push({ table, op: "upsert", payload, opts, filters });
          return Promise.resolve({ error: null });
        },
        insert(payload: unknown) {
          calls.push({ table, op: "insert", payload, filters });
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) {
          calls.push({ table, op: "update", payload, filters });
          return chain;
        },
        select(_cols: string) {
          return chain;
        },
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: { id: "packet-v2-id" }, error: null });
        },
        then(resolve: (v: { error: null }) => void) {
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
  return { admin, calls };
}

Deno.test("persistPacketResult writes version n+1 with supersedes and closes the loop", async () => {
  const { admin, calls } = fakeAdmin();
  await persistPacketResult(
    admin,
    {
      id: "run-2",
      user_id: "user-1",
      piece_id: "piece-1",
      input: { packet: { version: 2, supersedes_packet_id: "packet-v1-id" } },
    },
    {
      channels: [
        {
          channel: "packet",
          files: [
            { name: "post.md", content: "# Revised" },
            {
              name: "analysis.json",
              content: JSON.stringify({ claims: [{ id: "C1" }] }),
            },
            { name: "questions.json", content: JSON.stringify({ questions: [] }) },
          ],
        },
      ],
    },
  );

  const upsert = calls.find((c) => c.table === "packets" && c.op === "upsert");
  assert(upsert, "packet upsert expected");
  const row = upsert!.payload as Record<string, unknown>;
  assertEquals(row.version, 2);
  assertEquals(row.supersedes_packet_id, "packet-v1-id");

  // The superseded packet's follow-up loop is closed out.
  const stateUpdate = calls.find(
    (c) =>
      c.table === "packets" &&
      c.op === "update" &&
      (c.payload as Record<string, unknown>).followup_state === "researched",
  );
  assert(stateUpdate, "superseded packet must be marked researched");
  const questionUpdate = calls.find(
    (c) =>
      c.table === "followup_questions" &&
      c.op === "update" &&
      (c.payload as Record<string, unknown>).status === "researched",
  );
  assert(questionUpdate, "approved followup questions must be marked researched");
});

Deno.test("persistPacketResult without followup metadata stays version 1 (unchanged behavior)", async () => {
  const { admin, calls } = fakeAdmin();
  await persistPacketResult(
    admin,
    { id: "run-1", user_id: "user-1", piece_id: "piece-1" },
    {
      channels: [
        {
          channel: "packet",
          files: [
            { name: "post.md", content: "# Packet" },
            { name: "analysis.json", content: JSON.stringify({ claims: [{ id: "C1" }] }) },
            { name: "questions.json", content: JSON.stringify({ questions: [] }) },
          ],
        },
      ],
    },
  );
  const upsert = calls.find((c) => c.table === "packets" && c.op === "upsert");
  const row = upsert!.payload as Record<string, unknown>;
  assertEquals(row.version, 1);
  assertEquals(row.supersedes_packet_id, null);
  assert(
    !calls.some(
      (c) => c.op === "update" && (c.payload as Record<string, unknown>).followup_state,
    ),
    "no follow-up state updates for a v1 packet",
  );
});
