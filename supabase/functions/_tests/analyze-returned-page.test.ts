// HTTP-contract tests for analyze-returned-page (plan phase C5): auth,
// ownership, the already-analyzed idempotent replay, missing-key ordering
// (P0.5: no early return may strand a page in 'analyzing'), and the gateway
// failure path settling the page as failed.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  edgeRequest,
  loadHandler,
  USER_A,
  USER_B,
  withSupabaseStub,
  type RestQuery,
} from "./helpers/edge.ts";

const handler = await loadHandler("analyze-returned-page/index.ts");

const RETURN_ID = crypto.randomUUID();
const PAGE = {
  id: crypto.randomUUID(),
  user_id: USER_A.id,
  return_id: RETURN_ID,
  storage_path: `${USER_A.id}/${RETURN_ID}/page-1.jpg`,
  page_number: 1,
  status: "uploaded",
  packet_returns: {
    id: RETURN_ID,
    packet_id: crypto.randomUUID(),
    packets: {
      id: crypto.randomUUID(),
      run_id: crypto.randomUUID(),
      piece_id: crypto.randomUUID(),
    },
  },
};
const pageRow = (row: Record<string, unknown>) => (q: RestQuery) =>
  q.method === "GET" ? { body: [row] } : undefined;

Deno.test("analyze-returned-page: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ pageImageId: PAGE.id }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("analyze-returned-page: 400 without pageImageId", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("analyze-returned-page: someone else's page is 404", async () => {
  await withSupabaseStub({ tables: { page_images: pageRow(PAGE) } }, async () => {
    const res = await handler(edgeRequest({ pageImageId: PAGE.id }, USER_B.token));
    assertEquals(res.status, 404);
    assertEquals((await res.json()).code, "not_found");
  });
});

Deno.test(
  "analyze-returned-page: an analyzed page replays idempotently with no writes",
  async () => {
    let writes = 0;
    await withSupabaseStub(
      {
        tables: {
          page_images: (q) => {
            if (q.method === "GET") return { body: [{ ...PAGE, status: "analyzed" }] };
            writes++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ pageImageId: PAGE.id }, USER_A.token));
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.idempotent, true);
        assertEquals(body.blocksInserted, 0);
        assertEquals(writes, 0);
      },
    );
  },
);

Deno.test(
  "analyze-returned-page: missing LOVABLE_API_KEY is 500 BEFORE the page flips to analyzing",
  async () => {
    // P0.5 regression guard: the env check must run before any status write,
    // otherwise the page would be stranded in 'analyzing' forever.
    let statusWrites = 0;
    Deno.env.delete("LOVABLE_API_KEY");
    await withSupabaseStub(
      {
        tables: {
          page_images: (q) => {
            if (q.method === "GET") return { body: [PAGE] };
            if (q.method === "PATCH") statusWrites++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(edgeRequest({ pageImageId: PAGE.id }, USER_A.token));
        assertEquals(res.status, 500);
        assertEquals((await res.json()).code, "env_missing");
        assertEquals(statusWrites, 0);
      },
    );
  },
);

Deno.test(
  "analyze-returned-page: gateway failure is 502 and the page settles as failed",
  async () => {
    // The fake fetch rejects any non-Supabase origin, so the Lovable gateway
    // call fails exactly like a network outage would.
    Deno.env.set("LOVABLE_API_KEY", "test-lovable-key");
    const pageStatuses: string[] = [];
    try {
      await withSupabaseStub(
        {
          tables: {
            page_images: (q) => {
              if (q.method === "GET") return { body: [PAGE] };
              if (q.method === "PATCH" && typeof q.body?.status === "string") {
                pageStatuses.push(q.body.status);
              }
              return undefined;
            },
          },
        },
        async () => {
          const res = await handler(edgeRequest({ pageImageId: PAGE.id }, USER_A.token));
          assertEquals(res.status, 502);
          assertEquals((await res.json()).code, "recognition_failed");
          // analyzing first (before the call), failed after — never stranded.
          assertEquals(pageStatuses, ["analyzing", "failed"]);
        },
      );
    } finally {
      Deno.env.delete("LOVABLE_API_KEY");
    }
  },
);

Deno.test(
  "analyze-returned-page: unreadable photo returns retake reasons and fabricates nothing",
  async () => {
    Deno.env.set("LOVABLE_API_KEY", "test-lovable-key");
    const gatewayReply = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              page_number: 1,
              blocks: [],
              quality: { ok: false, issues: [{ code: "blur", message: "Photo is too blurry." }] },
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    let blocksInserted = 0;
    const pageStatuses: string[] = [];
    try {
      await withSupabaseStub(
        {
          external: (url) =>
            url.hostname === "ai.gateway.lovable.dev"
              ? new Response(JSON.stringify(gatewayReply), {
                  status: 200,
                  headers: { "content-type": "application/json" },
                })
              : undefined,
          tables: {
            page_images: (q) => {
              if (q.method === "GET") return { body: [PAGE] };
              if (q.method === "PATCH" && typeof q.body?.status === "string") {
                pageStatuses.push(q.body.status);
              }
              return undefined;
            },
            recognized_blocks: (q) => {
              if (q.method === "POST") blocksInserted++;
              return undefined;
            },
          },
        },
        async () => {
          const res = await handler(edgeRequest({ pageImageId: PAGE.id }, USER_A.token));
          assertEquals(res.status, 200);
          const body = await res.json();
          assertEquals(body.blocksInserted, 0);
          assertEquals(body.quality.ok, false);
          assert(body.quality.issues.some((i: { code: string }) => i.code === "blur"));
          assertEquals(blocksInserted, 0);
          assertEquals(pageStatuses, ["analyzing", "failed"]);
        },
      );
    } finally {
      Deno.env.delete("LOVABLE_API_KEY");
    }
  },
);
