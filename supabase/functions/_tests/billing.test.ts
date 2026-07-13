// Reversal-lifecycle tests for the pure billing math in _shared/billing.ts.
// stripe-webhook composes these two functions: refundCreditsToReverse gives
// the cumulative target for a charge's amount_refunded, and reversalDelta
// subtracts what prior refund/chargeback ledger entries already took back.
// The handler-level wiring (ledger lookup, idempotency keys) is exercised
// manually via the Stripe CLI plan in docs/BILLING.md.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { refundCreditsToReverse, reversalDelta } from "../_shared/billing.ts";

// A 20-credit pack bought for 3200 cents, refunded in two steps.
Deno.test("sequential partial refunds reverse only the delta each time", () => {
  // First partial refund: 800 of 3200 cents → cumulative target 5 credits.
  const first = refundCreditsToReverse(20, 3200, 800);
  assertEquals(first, 5);
  assertEquals(reversalDelta(first, 0), 5);

  // Second partial refund arrives with CUMULATIVE amount_refunded = 2400
  // → cumulative target 15; 5 already reversed → take back 10 more.
  const second = refundCreditsToReverse(20, 3200, 2400);
  assertEquals(second, 15);
  assertEquals(reversalDelta(second, 5), 10);

  // Full refund completes the reversal: target 20, 15 already gone → 5 more.
  const full = refundCreditsToReverse(20, 3200, 3200);
  assertEquals(reversalDelta(full, 15), 5);
});

Deno.test("duplicate delivery of the same refund event reverses nothing", () => {
  // The first delivery reversed 5; the redelivered event carries the same
  // cumulative amount_refunded, so the target equals what's already reversed.
  const target = refundCreditsToReverse(20, 3200, 800);
  assertEquals(reversalDelta(target, 5), 0);
});

Deno.test("dispute after a partial refund reverses only what is left", () => {
  // Partial refund already took back 5 of the 20 purchased credits; the
  // chargeback targets the whole purchase but must not over-reverse.
  assertEquals(reversalDelta(20, 5), 15);
});

Deno.test("dispute after a full refund reverses nothing", () => {
  assertEquals(reversalDelta(20, 20), 0);
});

Deno.test("a prior over-reversal is never paid back", () => {
  // e.g. chargeback reversed the full purchase, then a refund event lands
  // with a smaller cumulative target — the delta floors at zero.
  assertEquals(reversalDelta(10, 20), 0);
});

Deno.test("rounding across successive partials never exceeds the purchase", () => {
  // 5-credit pack, 1000 cents, refunded in three uneven steps.
  let reversed = 0;
  for (const cumulative of [333, 666, 1000]) {
    const target = refundCreditsToReverse(5, 1000, cumulative);
    reversed += reversalDelta(target, reversed);
  }
  assertEquals(reversed, 5);
});
