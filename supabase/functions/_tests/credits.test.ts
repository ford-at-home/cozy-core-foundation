// Unit tests for the credit reservation adapter (_shared/credits.ts) and
// the pure refund math (_shared/billing.ts), against a fake supabase admin
// client. The SECURITY DEFINER SQL itself is exercised by
// supabase/tests/credits.test.sql against a real database.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  releaseRunCredits,
  reserveCreditsForRun,
  settleRunCredits,
  sweepStaleReservations,
} from "../_shared/credits.ts";
import { refundCreditsToReverse } from "../_shared/billing.ts";

type RpcCall = { name: string; args: Record<string, unknown> };

// Minimal fake supporting exactly the chains credits.ts uses.
function fakeAdmin(opts: {
  rpcError?: (name: string) => { message: string } | null;
  balance?: number;
  heldReservations?: Array<{ run_id: string; agent_runs: { status: string } }>;
  childRuns?: Record<string, { id: string; status: string }>;
}) {
  const rpcCalls: RpcCall[] = [];
  const eventInserts: unknown[] = [];
  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ error: opts.rpcError?.(name) ?? null });
    },
    from(table: string) {
      return {
        select(_cols: string) {
          const rowsFor = (filter: [string, unknown]): unknown => {
            if (table === "credit_accounts") return { balance: opts.balance ?? 0 };
            if (table === "agent_runs") return opts.childRuns?.[String(filter[1])] ?? null;
            return null;
          };
          return {
            eq(k: string, v: unknown) {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: rowsFor([k, v]), error: null });
                },
                lt(_k2: string, _v2: unknown) {
                  return {
                    limit(_n: number) {
                      return Promise.resolve({
                        data: opts.heldReservations ?? [],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          if (table === "agent_run_events") eventInserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, rpcCalls, eventInserts };
}

Deno.test("reserve places the hold with the exact amount and run id", async () => {
  Deno.env.delete("CREDITS_MODE");
  const { admin, rpcCalls } = fakeAdmin({});
  const out = await reserveCreditsForRun(admin, {
    userId: "u1",
    runId: "r1",
    amount: 2,
    reason: "deep-research start",
  });
  assert(out.ok);
  assertEquals(rpcCalls, [
    {
      name: "reserve_credits",
      args: { _user_id: "u1", _run_id: "r1", _amount: 2, _reason: "deep-research start" },
    },
  ]);
});

Deno.test("insufficient credits blocks in enforce mode and reports the balance", async () => {
  Deno.env.delete("CREDITS_MODE");
  const { admin } = fakeAdmin({
    rpcError: (name) => (name === "reserve_credits" ? { message: "insufficient_credits" } : null),
    balance: 1,
  });
  const out = await reserveCreditsForRun(admin, {
    userId: "u1",
    runId: "r1",
    amount: 2,
    reason: "compose",
  });
  assert(!out.ok);
  assertEquals(out.code, "insufficient_credits");
  assertEquals((out as { balance: number }).balance, 1);
});

Deno.test("log mode observes but never blocks (rollback lever)", async () => {
  Deno.env.set("CREDITS_MODE", "log");
  try {
    const { admin } = fakeAdmin({
      rpcError: () => ({ message: "insufficient_credits" }),
      balance: 0,
    });
    const out = await reserveCreditsForRun(admin, {
      userId: "u1",
      runId: "r1",
      amount: 1,
      reason: "compose",
    });
    assert(out.ok);
  } finally {
    Deno.env.delete("CREDITS_MODE");
  }
});

Deno.test("infrastructure failure refuses dispatch in enforce mode", async () => {
  Deno.env.delete("CREDITS_MODE");
  const { admin } = fakeAdmin({ rpcError: () => ({ message: "connection reset" }) });
  const out = await reserveCreditsForRun(admin, {
    userId: "u1",
    runId: "r1",
    amount: 1,
    reason: "compose",
  });
  assert(!out.ok);
  assertEquals(out.code, "reserve_failed");
});

Deno.test("settle targets the chained parent's reservation", async () => {
  const { admin, rpcCalls } = fakeAdmin({});
  await settleRunCredits(admin, { id: "compose-1", parent_run_id: "research-1" }, "reconciler");
  assertEquals(rpcCalls, [{ name: "settle_reservation", args: { _run_id: "research-1" } }]);
});

Deno.test("release targets the run itself when there is no parent", async () => {
  const { admin, rpcCalls } = fakeAdmin({});
  await releaseRunCredits(admin, { id: "r1" }, "agent reported failure", "cursor-webhook");
  assertEquals(rpcCalls, [
    { name: "release_reservation", args: { _run_id: "r1", _reason: "agent reported failure" } },
  ]);
});

Deno.test("settle failure never throws; it records an audit event", async () => {
  const { admin, eventInserts } = fakeAdmin({
    rpcError: () => ({ message: "boom" }),
  });
  await settleRunCredits(admin, { id: "r1" }, "reconciler"); // must not throw
  assertEquals(eventInserts.length, 1);
  const evt = eventInserts[0] as { event_type: string; run_id: string };
  assertEquals(evt.event_type, "settle_failed");
  assertEquals(evt.run_id, "r1");
});

Deno.test("sweep releases holds for failed runs and settles completed ones", async () => {
  const { admin, rpcCalls } = fakeAdmin({
    heldReservations: [
      { run_id: "failed-run", agent_runs: { status: "failed" } },
      { run_id: "done-run", agent_runs: { status: "completed" } },
    ],
  });
  const resolved = await sweepStaleReservations(admin);
  assertEquals(resolved, 2);
  assertEquals(
    rpcCalls.map((c) => [c.name, c.args._run_id]),
    [
      ["release_reservation", "failed-run"],
      ["settle_reservation", "done-run"],
    ],
  );
});

Deno.test(
  "sweep leaves a completed research parent alone while its chained run is live",
  async () => {
    const { admin, rpcCalls } = fakeAdmin({
      heldReservations: [{ run_id: "research-1", agent_runs: { status: "completed" } }],
      childRuns: { "research-1": { id: "compose-1", status: "running" } },
    });
    const resolved = await sweepStaleReservations(admin);
    assertEquals(resolved, 0);
    assertEquals(rpcCalls.length, 0);
  },
);

Deno.test("sweep releases the parent's hold when the chained run failed", async () => {
  const { admin, rpcCalls } = fakeAdmin({
    heldReservations: [{ run_id: "research-1", agent_runs: { status: "completed" } }],
    childRuns: { "research-1": { id: "compose-1", status: "failed" } },
  });
  const resolved = await sweepStaleReservations(admin);
  assertEquals(resolved, 1);
  assertEquals(rpcCalls[0].name, "release_reservation");
});

Deno.test("refund math: full, partial, rounding, cap, and unknown totals", () => {
  assertEquals(refundCreditsToReverse(20, 3200, 3200), 20); // full refund
  assertEquals(refundCreditsToReverse(20, 3200, 1600), 10); // half
  assertEquals(refundCreditsToReverse(5, 1000, 999), 4); // rounds down
  assertEquals(refundCreditsToReverse(5, 1000, 0), 0); // nothing refunded
  assertEquals(refundCreditsToReverse(5, 1000, 2000), 5); // capped at purchase
  assertEquals(refundCreditsToReverse(5, 0, 500), 5); // unknown total: fail safe
});
