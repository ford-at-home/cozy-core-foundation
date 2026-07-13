// HTTP-contract tests for run-follow-up-research (plan phase C5): auth,
// packet ownership, the approved-questions prerequisite, requestId
// idempotency, the insert-race fallback (P1.4), the credit gate, and the
// dispatched happy path.
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

const handler = await loadHandler("run-follow-up-research/index.ts");

const PACKET = {
  id: crypto.randomUUID(),
  user_id: USER_A.id,
  piece_id: crypto.randomUUID(),
  version: 1,
};
const base: Routes["tables"] = {
  packets: (q: RestQuery) => (q.method === "GET" ? { body: [PACKET] } : undefined),
  followup_questions: (q: RestQuery) => (q.method === "HEAD" ? { count: 1 } : undefined),
  credit_accounts: (q: RestQuery) => (q.method === "GET" ? { body: [{ balance: 10 }] } : undefined),
};

Deno.test("run-follow-up-research: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ packetId: PACKET.id }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("run-follow-up-research: 400 without packetId", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("run-follow-up-research: someone else's packet is 404", async () => {
  await withSupabaseStub({ tables: base }, async () => {
    const res = await handler(edgeRequest({ packetId: PACKET.id }, USER_B.token));
    assertEquals(res.status, 404);
    assertEquals((await res.json()).code, "not_found");
  });
});

Deno.test("run-follow-up-research: zero approved questions is 422", async () => {
  await withSupabaseStub(
    {
      tables: {
        ...base,
        followup_questions: (q) => (q.method === "HEAD" ? { count: 0 } : undefined),
      },
    },
    async () => {
      const res = await handler(edgeRequest({ packetId: PACKET.id }, USER_A.token));
      assertEquals(res.status, 422);
      assertEquals((await res.json()).code, "no_approved_questions");
    },
  );
});

Deno.test(
  "run-follow-up-research: requestId replay returns the existing run without a new insert",
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
              q.params.get("idempotency_key") === `eq.followup:${USER_A.id}:${requestId}`
            ) {
              return { body: [existing] };
            }
            if (q.method === "POST") runInserts++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ packetId: PACKET.id, requestId }, USER_A.token));
        assertEquals(res.status, 202);
        const body = await res.json();
        assertEquals(body.runId, existing.id);
        assertEquals(body.idempotent, true);
        assertEquals(runInserts, 0);
      },
    );
  },
);

Deno.test("run-follow-up-research: zero balance is 402 before the run is created", async () => {
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
      const res = await handler(edgeRequest({ packetId: PACKET.id }, USER_A.token));
      assertEquals(res.status, 402);
      assertEquals((await res.json()).code, "insufficient_credits");
      assertEquals(runInserts, 0);
    },
  );
});

Deno.test("run-follow-up-research: insert race falls back to the rival run (P1.4)", async () => {
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
      const res = await handler(edgeRequest({ packetId: PACKET.id }, USER_A.token));
      assertEquals(res.status, 202);
      const body = await res.json();
      assertEquals(body.runId, rival.id);
      assertEquals(body.idempotent, true);
    },
  );
});

Deno.test(
  "run-follow-up-research: happy path reserves, attaches a session, dispatches, returns 201",
  async () => {
    let runInsert: Record<string, unknown> | null = null;
    let reserved: Record<string, unknown> | null = null;
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
          sessions: (q) => {
            if (q.method === "POST") sessionInserted = true;
            return undefined;
          },
        },
        rpc: {
          reserve_credits: (args) => {
            reserved = args;
            return { body: null };
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ packetId: PACKET.id }, USER_A.token));
        assertEquals(res.status, 201);
        const body = await res.json();
        assert(typeof body.runId === "string" && body.runId.length > 0);
        assertEquals(body.cost, 2);
        assertEquals(runInsert?.kind, "followup_research");
        assertEquals(runInsert?.status, "requested");
        assertEquals(reserved?._amount, 2);
        assertEquals(reserved?._user_id, USER_A.id);
        assert(sessionInserted, "no session attached before dispatch (P0.7)");
        assert(dispatched, "run never reached queued via the stub provider");
      },
    );
  },
);
