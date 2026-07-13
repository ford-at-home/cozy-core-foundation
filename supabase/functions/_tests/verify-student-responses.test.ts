// HTTP-contract tests for verify-student-responses (plan phase C5): auth,
// piece ownership, the block/segment ownership gate (corrections feed
// downstream prompts, so a forged target id must hard-fail), and the happy
// path writing verification_corrections.
import { assertEquals } from "jsr:@std/assert@1";
import {
  edgeRequest,
  loadHandler,
  USER_A,
  USER_B,
  withSupabaseStub,
  type RestQuery,
} from "./helpers/edge.ts";

const handler = await loadHandler("verify-student-responses/index.ts");

const PIECE = { id: crypto.randomUUID(), user_id: USER_A.id };
const ownedPiece = (q: RestQuery) => (q.method === "GET" ? { body: [PIECE] } : undefined);
const BLOCK_ID = crypto.randomUUID();
const correction = { blockId: BLOCK_ID, correctedText: "the corrected words" };

Deno.test("verify-student-responses: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id, corrections: [correction] }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("verify-student-responses: 400 without pieceId or corrections", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id, corrections: [] }, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("verify-student-responses: 400 over the corrections cap", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(
      edgeRequest({ pieceId: PIECE.id, corrections: Array(501).fill(correction) }, USER_A.token),
    );
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "too_many");
  });
});

Deno.test("verify-student-responses: someone else's piece is 404", async () => {
  await withSupabaseStub({ tables: { pieces: ownedPiece } }, async () => {
    const res = await handler(
      edgeRequest({ pieceId: PIECE.id, corrections: [correction] }, USER_B.token),
    );
    assertEquals(res.status, 404);
    assertEquals((await res.json()).code, "not_found");
  });
});

Deno.test(
  "verify-student-responses: a correction targeting an unowned block is 404, nothing stored",
  async () => {
    let inserts = 0;
    await withSupabaseStub(
      {
        tables: {
          pieces: ownedPiece,
          // Ownership probe finds no matching recognized_blocks row.
          recognized_blocks: (q) => (q.method === "GET" ? { body: [] } : undefined),
          verification_corrections: (q) => {
            if (q.method === "POST") inserts++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest({ pieceId: PIECE.id, corrections: [correction] }, USER_A.token),
        );
        assertEquals(res.status, 404);
        assertEquals((await res.json()).code, "not_found");
        assertEquals(inserts, 0);
      },
    );
  },
);

Deno.test("verify-student-responses: happy path stores rows and returns 201", async () => {
  let insertedRows: Array<Record<string, unknown>> = [];
  await withSupabaseStub(
    {
      tables: {
        pieces: ownedPiece,
        recognized_blocks: (q) => (q.method === "GET" ? { body: [{ id: BLOCK_ID }] } : undefined),
        verification_corrections: (q) => {
          if (q.method === "POST") insertedRows = Array.isArray(q.body) ? q.body : [q.body];
          return undefined;
        },
      },
    },
    async () => {
      const res = await handler(
        edgeRequest({ pieceId: PIECE.id, corrections: [correction] }, USER_A.token),
      );
      assertEquals(res.status, 201);
      assertEquals((await res.json()).inserted, 1);
      assertEquals(insertedRows.length, 1);
      assertEquals(insertedRows[0].block_id, BLOCK_ID);
      assertEquals(insertedRows[0].corrected_text, correction.correctedText);
      // Server-derived identity, never client-supplied.
      assertEquals(insertedRows[0].user_id, USER_A.id);
      assertEquals(insertedRows[0].verified_by, USER_A.id);
    },
  );
});
