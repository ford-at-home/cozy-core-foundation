// Integration-style tests for the deep-research reconcile + chain step,
// against a fake supabase admin client and a stubbed Parallel HTTP API.
// The Cursor side uses the stub provider (AGENT_PROVIDER=stub).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reconcileResearch } from "../_shared/research.ts";

Deno.env.set("PARALLEL_API_KEY", "test-key");
Deno.env.set("AGENT_PROVIDER", "stub");

// ---------------------------------------------------------------- fetch stub
function stubParallel(responses: Record<string, unknown>) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const [suffix, body] of Object.entries(responses)) {
      if (url.endsWith(suffix)) {
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

// ---------------------------------------------------- minimal supabase fake
// Supports the exact chains research.ts uses:
//   from(t).select(c).eq(k,v).maybeSingle()
//   from(t).insert(o)                       (awaited -> {error})
//   from(t).insert(o).select(c).single()
//   from(t).update(o).eq(k,v)               (awaited -> {error})
type Call = { table: string; op: string; payload?: unknown; filter?: [string, unknown] };

function fakeAdmin(handlers: {
  maybeSingle: (table: string, filter: [string, unknown]) => unknown;
  insertSingle: (table: string, payload: unknown) => { data: unknown; error: unknown };
}) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(k: string, v: unknown) {
              return {
                maybeSingle() {
                  calls.push({ table, op: "select", filter: [k, v] });
                  return Promise.resolve({
                    data: handlers.maybeSingle(table, [k, v]),
                    error: null,
                  });
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          const thenable = {
            select(_cols: string) {
              return {
                single() {
                  calls.push({ table, op: "insert", payload });
                  return Promise.resolve(handlers.insertSingle(table, payload));
                },
              };
            },
            then(resolve: (v: unknown) => void) {
              calls.push({ table, op: "insert", payload });
              resolve({ error: null });
            },
          };
          return thenable;
        },
        update(payload: unknown) {
          return {
            eq(k: string, v: unknown) {
              calls.push({ table, op: "update", payload, filter: [k, v] });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

const RESEARCH_RUN = {
  id: "run-research-1",
  user_id: "user-1",
  piece_id: "piece-1",
  kind: "research",
  status: "running",
  external_agent_id: null,
  external_run_id: "trun_test1",
  created_at: new Date().toISOString(),
  input: { topic: "test topic", goal: "test goal", processor: "ultra-fast" },
};

const PARALLEL_DONE = {
  "/trun_test1": { status: "completed" },
  "/trun_test1/result": {
    output: {
      content: "# Report\n\nClaim [a](https://a.example/x).",
      basis: [{ citations: [{ url: "https://b.example/y" }] }],
    },
  },
};

Deno.test("research completion chains exactly one compose run and dispatches it", async () => {
  const restore = stubParallel(PARALLEL_DONE);
  try {
    const { admin, calls } = fakeAdmin({
      maybeSingle: (table) => {
        if (table === "profiles") return { style_text: "My voice.", image_style: "" };
        if (table === "pieces") return { slug: "test-topic-abc123" };
        return null;
      },
      insertSingle: (table, payload) => {
        assertEquals(table, "agent_runs");
        const p = payload as Record<string, unknown>;
        assertEquals(p.kind, "proposal");
        assertEquals(p.idempotency_key, "compose:user-1:research:run-research-1");
        return { data: { id: "run-compose-1" }, error: null };
      },
    });

    await reconcileResearch(admin, { ...RESEARCH_RUN });

    // Research run completed with the report + pointer to the chained run.
    const completion = calls.find(
      (c) =>
        c.table === "agent_runs" &&
        c.op === "update" &&
        (c.payload as any)?.status === "completed" &&
        c.filter?.[1] === "run-research-1",
    );
    assert(completion, "research run was not marked completed");
    const result = (completion!.payload as any).result;
    assertEquals(result.nextRunId, "run-compose-1");
    const report: string = result.channels[0].files[0].content;
    assert(report.includes("source: parallel-deep-research"));
    assert(report.includes("https://a.example/x"));
    assert(report.includes("https://b.example/y")); // basis URL appended as evidence

    // The chained compose run was dispatched (stub provider -> queued).
    const dispatched = calls.find(
      (c) =>
        c.table === "agent_runs" &&
        c.op === "update" &&
        (c.payload as any)?.status === "queued" &&
        c.filter?.[1] === "run-compose-1",
    );
    assert(dispatched, "chained compose run was not dispatched");
    assert(String((dispatched!.payload as any).external_agent_id).startsWith("bc_stub_"));
  } finally {
    restore();
  }
});

Deno.test("re-sweep after a crash does not chain a second compose run", async () => {
  const restore = stubParallel(PARALLEL_DONE);
  try {
    const { admin, calls } = fakeAdmin({
      maybeSingle: (table, [k]) => {
        if (table === "profiles") return { style_text: "My voice.", image_style: "" };
        if (table === "pieces") return { slug: "test-topic-abc123" };
        // Existing chain lookup by idempotency_key.
        if (table === "agent_runs" && k === "idempotency_key") return { id: "run-compose-1" };
        return null;
      },
      // Unique violation: the chain already exists from the previous sweep.
      insertSingle: () => ({
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "agent_runs_idempotency_key_key"',
        },
      }),
    });

    await reconcileResearch(admin, { ...RESEARCH_RUN });

    const completion = calls.find(
      (c) =>
        c.table === "agent_runs" && c.op === "update" && (c.payload as any)?.status === "completed",
    );
    assert(completion, "research run should still converge to completed");
    assertEquals((completion!.payload as any).result.nextRunId, "run-compose-1");

    // No second dispatch: nothing was moved to queued.
    const dispatched = calls.filter(
      (c) => c.op === "update" && (c.payload as any)?.status === "queued",
    );
    assertEquals(dispatched.length, 0);
  } finally {
    restore();
  }
});

Deno.test("empty voice at chain time fails the run with guidance, keeping the report", async () => {
  const restore = stubParallel(PARALLEL_DONE);
  try {
    const { admin, calls } = fakeAdmin({
      maybeSingle: (table) => {
        if (table === "profiles") return { style_text: "  ", image_style: "" };
        if (table === "pieces") return { slug: "test-topic-abc123" };
        return null;
      },
      insertSingle: () => {
        throw new Error("must not chain without a voice");
      },
    });

    await reconcileResearch(admin, { ...RESEARCH_RUN });

    const failed = calls.find((c) => c.op === "update" && (c.payload as any)?.status === "failed");
    assert(failed, "run should fail when the voice is empty");
    assert(String((failed!.payload as any).error).includes("voice profile"));
    // The report is not lost: it is stored on the failed run.
    assert((failed!.payload as any).result.channels[0].files[0].content.includes("# Report"));
  } finally {
    restore();
  }
});
