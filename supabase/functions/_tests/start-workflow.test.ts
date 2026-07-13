// HTTP-contract tests for the start-workflow Edge Function (plan phase C5).
// Every test drives the real Deno.serve handler with a fake Request against
// the in-process fake Supabase server — no network, no database.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  edgeRequest,
  loadHandler,
  UNIQUE_VIOLATION,
  USER_A,
  withSupabaseStub,
  type RestQuery,
} from "./helpers/edge.ts";

const handler = await loadHandler("start-workflow/index.ts");

// Route fragments shared by the happy-path-shaped tests: a caller with a
// voice profile and enough credits to pass the pre-check.
const profileWithVoice = (q: RestQuery) =>
  q.method === "GET" ? { body: [{ style_text: "warm, plain voice", image_style: "" }] } : undefined;
const fundedAccount = (q: RestQuery) =>
  q.method === "GET" ? { body: [{ balance: 10 }] } : undefined;

Deno.test("start-workflow: rejects missing and invalid tokens with 401", async () => {
  await withSupabaseStub({}, async () => {
    const noToken = await handler(edgeRequest({ research: "facts" }));
    assertEquals(noToken.status, 401);
    await noToken.body?.cancel();

    const badToken = await handler(edgeRequest({ research: "facts" }, "not-a-real-token"));
    assertEquals(badToken.status, 401);
    const body = await badToken.json();
    assertEquals(body.code, "invalid_token");
  });
});

Deno.test("start-workflow: rejects non-POST with 405", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(new Request("http://edge.test/fn", { method: "GET" }));
    assertEquals(res.status, 405);
    await res.body?.cancel();
  });
});

Deno.test("start-workflow: empty body is 400 no_input", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "no_input");
  });
});

Deno.test(
  "start-workflow: topic mode without PARALLEL_API_KEY is 422 research_disabled",
  async () => {
    await withSupabaseStub({}, async () => {
      const res = await handler(edgeRequest({ topic: "the moon" }, USER_A.token));
      assertEquals(res.status, 422);
      assertEquals((await res.json()).code, "research_disabled");
    });
  },
);

Deno.test("start-workflow: longform without a voice profile is 422 empty_voice", async () => {
  // Default profiles GET returns no rows -> empty voice.
  await withSupabaseStub({}, async () => {
    const res = await handler(
      edgeRequest({ research: "pasted research", requestId: crypto.randomUUID() }, USER_A.token),
    );
    assertEquals(res.status, 422);
    assertEquals((await res.json()).code, "empty_voice");
  });
});

Deno.test("start-workflow: zero balance is 402 before any row is created", async () => {
  let pieceInserts = 0;
  await withSupabaseStub(
    {
      tables: {
        profiles: profileWithVoice,
        // Default credit_accounts GET returns no rows -> balance 0.
        pieces: (q) => {
          if (q.method === "POST") pieceInserts++;
          return undefined;
        },
      },
    },
    async () => {
      const res = await handler(
        edgeRequest({ research: "pasted research", requestId: crypto.randomUUID() }, USER_A.token),
      );
      assertEquals(res.status, 402);
      assertEquals((await res.json()).code, "insufficient_credits");
      assertEquals(pieceInserts, 0);
    },
  );
});

Deno.test("start-workflow: requestId replay returns the existing run, no new rows", async () => {
  const requestId = crypto.randomUUID();
  const existing = { id: crypto.randomUUID(), piece_id: crypto.randomUUID() };
  let pieceInserts = 0;
  await withSupabaseStub(
    {
      tables: {
        agent_runs: (q) => {
          if (
            q.method === "GET" &&
            q.params.get("idempotency_key") === `eq.compose:${USER_A.id}:${requestId}`
          ) {
            return { body: [existing] };
          }
          return undefined;
        },
        pieces: (q) => {
          if (q.method === "POST") pieceInserts++;
          return undefined;
        },
      },
    },
    async () => {
      const res = await handler(
        edgeRequest({ research: "pasted research", requestId }, USER_A.token),
      );
      assertEquals(res.status, 202);
      const body = await res.json();
      assertEquals(body.runId, existing.id);
      assertEquals(body.pieceId, existing.piece_id);
      assertEquals(pieceInserts, 0);
    },
  );
});

Deno.test(
  "start-workflow: happy path inserts piece+run, dispatches to stub, returns 202",
  async () => {
    const requestId = crypto.randomUUID();
    let runInsert: Record<string, unknown> | null = null;
    let dispatched = false;
    await withSupabaseStub(
      {
        tables: {
          profiles: profileWithVoice,
          credit_accounts: fundedAccount,
          agent_runs: (q) => {
            if (q.method === "POST") runInsert = q.body;
            // The post-dispatch status update carries the stub agent id.
            if (q.method === "PATCH" && q.body?.status === "queued") dispatched = true;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest({ research: "pasted research", requestId }, USER_A.token),
        );
        assertEquals(res.status, 202);
        const body = await res.json();
        assert(typeof body.runId === "string" && body.runId.length > 0);
        assert(typeof body.pieceId === "string" && body.pieceId.length > 0);
        assertEquals(runInsert?.kind, "proposal");
        assertEquals(runInsert?.status, "dispatching");
        assertEquals(runInsert?.idempotency_key, `compose:${USER_A.id}:${requestId}`);
        // The prompt (and therefore the caller's voice) never lands on the row.
        assertEquals("style_text" in ((runInsert?.input as object) ?? {}), false);
        assert(dispatched, "run was never marked queued after stub dispatch");
      },
    );
  },
);

Deno.test(
  "start-workflow: insert race returns rival run and deletes the orphan piece",
  async () => {
    const requestId = crypto.randomUUID();
    const rival = { id: crypto.randomUUID(), piece_id: crypto.randomUUID() };
    let agentRunsGets = 0;
    let pieceDeleted = false;
    await withSupabaseStub(
      {
        tables: {
          profiles: profileWithVoice,
          credit_accounts: fundedAccount,
          agent_runs: (q) => {
            if (q.method === "GET") {
              agentRunsGets++;
              // 1st GET: idempotency check, nothing yet. 2nd GET: after the
              // insert lost the race, the rival's run is visible.
              return { body: agentRunsGets === 1 ? [] : [rival] };
            }
            if (q.method === "POST") return UNIQUE_VIOLATION;
            return undefined;
          },
          pieces: (q) => {
            if (q.method === "DELETE") pieceDeleted = true;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest({ research: "pasted research", requestId }, USER_A.token),
        );
        assertEquals(res.status, 202);
        const body = await res.json();
        assertEquals(body.runId, rival.id);
        assertEquals(body.pieceId, rival.piece_id);
        assert(pieceDeleted, "orphaned piece was not deleted after the lost insert race");
      },
    );
  },
);

Deno.test("start-workflow: failed credit reservation fails the run with 402", async () => {
  let runFailed = false;
  await withSupabaseStub(
    {
      tables: {
        profiles: profileWithVoice,
        credit_accounts: fundedAccount,
        agent_runs: (q) => {
          if (q.method === "PATCH" && q.body?.status === "failed") runFailed = true;
          return undefined;
        },
      },
      rpc: {
        // The atomic hold is the authority; the earlier balance pre-check
        // passing must not matter.
        reserve_credits: () => ({ status: 400, body: { message: "insufficient_credits" } }),
      },
    },
    async () => {
      const res = await handler(
        edgeRequest({ research: "pasted research", requestId: crypto.randomUUID() }, USER_A.token),
      );
      assertEquals(res.status, 402);
      assertEquals((await res.json()).code, "insufficient_credits");
      assert(runFailed, "run was not marked failed after reservation refusal");
    },
  );
});
