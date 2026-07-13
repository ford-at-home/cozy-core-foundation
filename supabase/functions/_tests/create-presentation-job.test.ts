// HTTP-contract tests for create-presentation-job, mirroring
// create-final-document-job.test.ts: auth, piece ownership, requestId
// idempotency, the credit gate, and the dispatched happy path including the
// pending final_artifacts row (kind='pptx').
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

const handler = await loadHandler("create-presentation-job/index.ts");

const PIECE = {
  id: crypto.randomUUID(),
  user_id: USER_A.id,
  workflow_stage: "final_document_ready",
  slug: "test-piece",
  title: "Test piece",
};
const base: Routes["tables"] = {
  pieces: (q: RestQuery) => (q.method === "GET" ? { body: [PIECE] } : undefined),
  credit_accounts: (q: RestQuery) => (q.method === "GET" ? { body: [{ balance: 10 }] } : undefined),
};

Deno.test("create-presentation-job: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("create-presentation-job: 400 without pieceId", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("create-presentation-job: someone else's piece is 404", async () => {
  await withSupabaseStub({ tables: base }, async () => {
    const res = await handler(edgeRequest({ pieceId: PIECE.id }, USER_B.token));
    assertEquals(res.status, 404);
    assertEquals((await res.json()).code, "not_found");
  });
});

Deno.test(
  "create-presentation-job: requestId replay returns the existing run without a new insert",
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
              q.params.get("idempotency_key") === `eq.final_pptx:${USER_A.id}:${requestId}`
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

Deno.test("create-presentation-job: zero balance is 402 before the run is created", async () => {
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

Deno.test("create-presentation-job: insert race falls back to the rival run", async () => {
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
  "create-presentation-job: happy path creates run + pending pptx artifact and dispatches",
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
        assertEquals(runInsert?.kind, "final_pptx");
        assertEquals(runInsert?.status, "requested");
        assertEquals(artifactInsert?.kind, "pptx");
        assertEquals(artifactInsert?.status, "pending");
        assertEquals(artifactInsert?.user_id, USER_A.id);
        assert(sessionInserted, "no session attached before dispatch (P0.7)");
        assert(dispatched, "run never reached queued via the stub provider");
      },
    );
  },
);
