// ensureRunSession (P0.7): the three job-creation functions
// (run-follow-up-research, create-final-document-job, create-presentation-job)
// now attach a session at run creation — without one, recordInference
// silently drops every cost row for the run. These tests pin the helper's
// contract: reuse the piece's session, create one when missing, survive the
// unique(piece_id) race, and stamp session_id + provider onto the run.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { ensureRunSession, testAccountContext } from "../_shared/usage.ts";

type Q = {
  table: string;
  op: "select" | "insert" | "update";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function fakeAdmin(respond: (q: Q, nth: number) => { data?: unknown; error?: unknown }) {
  const queries: Q[] = [];
  function from(table: string) {
    const q: Q = { table, op: "select", filters: [] };
    let counted = false;
    const record = () => {
      if (!counted) {
        queries.push(q);
        counted = true;
      }
      return respond(q, queries.length - 1);
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select(_cols: string) {
        return b;
      },
      insert(payload: unknown) {
        q.op = "insert";
        q.payload = payload;
        return b;
      },
      update(payload: unknown) {
        q.op = "update";
        q.payload = payload;
        return b;
      },
      eq(k: string, v: unknown) {
        q.filters.push([k, v]);
        return b;
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null, ...record() });
      },
      single() {
        return Promise.resolve({ data: null, error: null, ...record() });
      },
      // deno-lint-ignore no-explicit-any
      then(resolve: any, reject: any) {
        return Promise.resolve({ data: null, error: null, ...record() }).then(resolve, reject);
      },
    };
    return b;
  }
  return { admin: { from }, queries };
}

Deno.test("ensureRunSession: reuses the piece's existing session and stamps the run", async () => {
  const { admin, queries } = fakeAdmin((q) => {
    if (q.table === "sessions" && q.op === "select") return { data: { id: "sess-1" } };
    return {};
  });
  const id = await ensureRunSession(admin, {
    runId: "run-1",
    userId: "u1",
    pieceId: "piece-1",
    provider: "cursor",
  });
  assertEquals(id, "sess-1");
  const runUpdate = queries.find((q) => q.table === "agent_runs" && q.op === "update");
  assert(runUpdate);
  assertEquals(runUpdate.payload, { session_id: "sess-1", provider: "cursor" });
  assertEquals(runUpdate.filters, [["id", "run-1"]]);
});

Deno.test("ensureRunSession: creates a session when the piece has none", async () => {
  const { admin, queries } = fakeAdmin((q) => {
    if (q.table === "sessions" && q.op === "select") return { data: null };
    if (q.table === "sessions" && q.op === "insert") return { data: { id: "sess-new" } };
    return {};
  });
  const id = await ensureRunSession(admin, { runId: "run-1", userId: "u1", pieceId: "piece-1" });
  assertEquals(id, "sess-new");
  const insert = queries.find((q) => q.table === "sessions" && q.op === "insert");
  assert(insert);
  assertEquals((insert.payload as { piece_id: string }).piece_id, "piece-1");
});

Deno.test("ensureRunSession: losing the unique(piece_id) race re-reads the winner", async () => {
  let selects = 0;
  const { admin } = fakeAdmin((q) => {
    if (q.table === "sessions" && q.op === "select") {
      selects += 1;
      // First read: nothing. After the failed insert: the winner's row.
      return { data: selects === 1 ? null : { id: "sess-winner" } };
    }
    if (q.table === "sessions" && q.op === "insert") return { data: null };
    return {};
  });
  const id = await ensureRunSession(admin, { runId: "run-1", userId: "u1", pieceId: "piece-1" });
  assertEquals(id, "sess-winner");
});

Deno.test("testAccountContext (P1.10): stamps 'test' only for listed accounts", () => {
  const prev = Deno.env.get("TEST_ACCOUNT_IDS");
  try {
    // Unset: never writes the column (safe before the migration applies).
    Deno.env.delete("TEST_ACCOUNT_IDS");
    assertEquals(testAccountContext("u1"), {});

    Deno.env.set("TEST_ACCOUNT_IDS", " u1 , u2 ");
    assertEquals(testAccountContext("u1"), { context: "test" });
    assertEquals(testAccountContext("u2"), { context: "test" });
    assertEquals(testAccountContext("u3"), {});
    assertEquals(testAccountContext(null), {});
  } finally {
    if (prev === undefined) Deno.env.delete("TEST_ACCOUNT_IDS");
    else Deno.env.set("TEST_ACCOUNT_IDS", prev);
  }
});
