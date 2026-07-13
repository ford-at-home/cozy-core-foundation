// HTTP-contract tests for create-final-document-job (plan phase C5): auth,
// piece ownership, requestId idempotency, the insert-race fallback (P1.4),
// the credit gate, and the dispatched happy path including the pending
// final_artifacts row.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  edgeRequest,
  loadHandler,
  UNIQUE_VIOLATION,
  USER_A,
  USER_B,
  withSupabaseStub,
  type RestQuery,
  type Routes,
} from "./helpers/edge.ts";

const handler = await loadHandler("create-final-document-job/index.ts");

const PIECE = {
  id: crypto.randomUUID(),
  user_id: USER_A.id,
  workflow_stage: "followup_complete",
  slug: "test-piece",
  title: "Test piece",
};
const base: Routes["tables"] = {
  pieces: (q: RestQuery) => (q.method === "GET" ? { body: [PIECE] } : undefined),
  credit_accounts: (q: RestQuery) => (q.method === "GET" ? { body: [{ balance: 10 }] } : undefined),
};

Deno.test("create-final-document-job: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("create-final-document-job: 400 without pieceId", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("create-final-document-job: someone else's piece is 404", async () => {
  await withSupabaseStub({ tables: base }, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id }, USER_B.token));
    assertEquals(res.status, 404);
    assertEquals((await res.json()).code, "not_found");
  });
});

Deno.test(
  "create-final-document-job: requestId replay returns the existing run without a new insert",
  async () => {
    const requestId = crypto.randomUUID();
    const existing = { id: crypto.randomUUID() };
    let runInserts = 0;
    await withSupabaseStub(
      {
        tables: {
          ...base,
          agent_runs: (q) => {
            if (
              q.method === "GET" &&
              q.params.get("idempotency_key") === `eq.final_docx:${USER_A.id}:${requestId}`
            ) {
              return { body: [existing] };
            }
            if (q.method === "POST") runInserts++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ pieceId: PIECE.id, requestId }, USER_A.token));
        assertEquals(res.status, 202);
        const body = await res.json();
        assertEquals(body.runId, existing.id);
        assertEquals(body.idempotent, true);
        assertEquals(runInserts, 0);
      },
    );
  },
);

Deno.test("create-final-document-job: zero balance is 402 before the run is created", async () => {
  let runInserts = 0;
  await withSupabaseStub(
    {
      tables: {
        ...base,
        credit_accounts: (q) => (q.method === "GET" ? { body: [] } : undefined),
        agent_runs: (q) => {
          if (q.method === "POST") runInserts++;
          return undefined;
        },
      },
    },
    async () => {
      const res = await handler(edgeRequest({ pieceId: PIECE.id }, USER_A.token));
      assertEquals(res.status, 402);
      assertEquals((await res.json()).code, "insufficient_credits");
      assertEquals(runInserts, 0);
    },
  );
});

Deno.test("create-final-document-job: insert race falls back to the rival run (P1.4)", async () => {
  const rival = { id: crypto.randomUUID() };
  let agentRunsGets = 0;
  await withSupabaseStub(
    {
      tables: {
        ...base,
        agent_runs: (q) => {
          if (q.method === "GET") {
            agentRunsGets++;
            return { body: agentRunsGets === 1 ? [] : [rival] };
          }
          if (q.method === "POST") return UNIQUE_VIOLATION;
          return undefined;
        },
      },
    },
    async () => {
      const res = await handler(edgeRequest({ pieceId: PIECE.id }, USER_A.token));
      assertEquals(res.status, 202);
      const body = await res.json();
      assertEquals(body.runId, rival.id);
      assertEquals(body.idempotent, true);
    },
  );
});

Deno.test(
  "create-final-document-job: happy path creates run + pending artifact and dispatches",
  async () => {
    let runInsert: Record<string, unknown> | null = null;
    let artifactInsert: Record<string, unknown> | null = null;
    let sessionInserted = false;
    let dispatched = false;
    await withSupabaseStub(
      {
        tables: {
          ...base,
          agent_runs: (q) => {
            if (q.method === "POST") runInsert = q.body;
            if (q.method === "PATCH" && q.body?.status === "queued") dispatched = true;
            return undefined;
          },
          final_artifacts: (q) => {
            if (q.method === "POST") artifactInsert = q.body;
            return undefined;
          },
          sessions: (q) => {
            if (q.method === "POST") sessionInserted = true;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ pieceId: PIECE.id }, USER_A.token));
        assertEquals(res.status, 201);
        const body = await res.json();
        assert(typeof body.runId === "string" && body.runId.length > 0);
        assert(typeof body.artifactId === "string" && body.artifactId.length > 0);
        assertEquals(body.cost, 2);
        assertEquals(runInsert?.kind, "final_docx");
        assertEquals(runInsert?.status, "requested");
        assertEquals(artifactInsert?.kind, "docx");
        assertEquals(artifactInsert?.status, "pending");
        assertEquals(artifactInsert?.user_id, USER_A.id);
        assert(sessionInserted, "no session attached before dispatch (P0.7)");
        assert(dispatched, "run never reached queued via the stub provider");
      },
    );
  },
);
