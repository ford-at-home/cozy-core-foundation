// Stale-'analyzing' sweep + return settling (P0.5): a crash between the
// status flip and the settle in analyze-returned-page must not leave a page
// (and its return) stuck forever — the reconciler sweep fails it with retake
// guidance and settles the return. Fake supabase admin, network-free.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { settleReturnStatus, sweepStaleAnalyzingPages } from "../_shared/pages.ts";

// ---------------------------------------------------- minimal supabase fake
// Generic thenable query builder covering the chains pages.ts uses:
//   from(t).select(c).eq(...).lt(...)          (awaited -> {data})
//   from(t).update(o).eq(...).eq/neq(...).select(c)  (awaited -> {data})
//   from(t).insert(o)                          (awaited -> {error})
type Q = {
  table: string;
  op: "select" | "update" | "insert";
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
};

function fakeAdmin(respond: (q: Q) => { data?: unknown; error?: unknown }) {
  const queries: Q[] = [];
  function from(table: string) {
    const q: Q = { table, op: "select", filters: [] };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select(_cols: string) {
        return b;
      },
      update(payload: unknown) {
        q.op = "update";
        q.payload = payload;
        return b;
      },
      insert(payload: unknown) {
        q.op = "insert";
        q.payload = payload;
        return b;
      },
      eq(k: string, v: unknown) {
        q.filters.push(["eq", k, v]);
        return b;
      },
      neq(k: string, v: unknown) {
        q.filters.push(["neq", k, v]);
        return b;
      },
      lt(k: string, v: unknown) {
        q.filters.push(["lt", k, v]);
        return b;
      },
      // deno-lint-ignore no-explicit-any
      then(resolve: any, reject: any) {
        queries.push(q);
        return Promise.resolve({ data: null, error: null, ...respond(q) }).then(resolve, reject);
      },
    };
    return b;
  }
  return { admin: { from }, queries };
}

const filterValue = (q: Q, key: string) => q.filters.find(([, k]) => k === key)?.[2];

Deno.test(
  "sweep: stale analyzing pages are failed with retake guidance and returns settle",
  async () => {
    const { admin, queries } = fakeAdmin((q) => {
      if (
        q.table === "page_images" &&
        q.op === "select" &&
        filterValue(q, "status") === "analyzing"
      )
        return { data: [{ id: "p1", return_id: "r1" }] };
      if (q.table === "page_images" && q.op === "update") return { data: [{ id: "p1" }] };
      // settle: after the sweep, no page on r1 is pending and none analyzed
      if (q.table === "page_images" && q.op === "select" && filterValue(q, "return_id") === "r1")
        return { data: [{ status: "failed" }] };
      if (q.table === "packet_returns" && q.op === "update") return { data: [{ id: "r1" }] };
      return {};
    });

    const swept = await sweepStaleAnalyzingPages(admin);
    assertEquals(swept, 1);

    const pageUpdate = queries.find((q) => q.table === "page_images" && q.op === "update");
    assert(pageUpdate);
    const payload = pageUpdate.payload as { status: string; quality: { ok: boolean } };
    assertEquals(payload.status, "failed");
    assertEquals(payload.quality.ok, false);
    // Only pages still 'analyzing' may be swept (idempotency guard).
    assertEquals(filterValue(pageUpdate, "status"), "analyzing");

    const returnUpdate = queries.find((q) => q.table === "packet_returns" && q.op === "update");
    assert(returnUpdate, "the return must settle once no page is pending");
    assertEquals((returnUpdate.payload as { status: string }).status, "failed");
  },
);

Deno.test("sweep: nothing stale means zero writes", async () => {
  const { admin, queries } = fakeAdmin((q) => {
    if (q.table === "page_images" && q.op === "select") return { data: [] };
    return {};
  });
  assertEquals(await sweepStaleAnalyzingPages(admin), 0);
  assert(!queries.some((q) => q.op === "update"));
});

Deno.test("sweep: a page settled concurrently is not double-counted or re-settled", async () => {
  const { admin, queries } = fakeAdmin((q) => {
    if (q.table === "page_images" && q.op === "select" && filterValue(q, "status") === "analyzing")
      return { data: [{ id: "p1", return_id: "r1" }] };
    // The guarded update matches no rows: someone else settled it first.
    if (q.table === "page_images" && q.op === "update") return { data: [] };
    return {};
  });
  assertEquals(await sweepStaleAnalyzingPages(admin), 0);
  assert(!queries.some((q) => q.table === "packet_returns"));
});

Deno.test("settle: a return with pages still pending is left alone", async () => {
  const { admin, queries } = fakeAdmin((q) => {
    if (q.table === "page_images" && q.op === "select")
      return { data: [{ status: "analyzed" }, { status: "analyzing" }] };
    return {};
  });
  await settleReturnStatus(admin, "r1");
  assert(!queries.some((q) => q.table === "packet_returns"));
});

Deno.test(
  "settle: at least one analyzed page makes the return ready and logs the event",
  async () => {
    const { admin, queries } = fakeAdmin((q) => {
      if (q.table === "page_images" && q.op === "select")
        return { data: [{ status: "analyzed" }, { status: "failed" }] };
      if (q.table === "packet_returns" && q.op === "update") return { data: [{ id: "r1" }] };
      return {};
    });
    await settleReturnStatus(admin, "r1", { pieceId: "piece-1", userId: "u1" });

    const returnUpdate = queries.find((q) => q.table === "packet_returns" && q.op === "update");
    assert(returnUpdate);
    assertEquals((returnUpdate.payload as { status: string }).status, "ready");

    const event = queries.find((q) => q.table === "piece_events" && q.op === "insert");
    assert(event, "the transition must log a piece event when ctx is provided");
    assertEquals((event.payload as { event: string }).event, "return_read");
  },
);
