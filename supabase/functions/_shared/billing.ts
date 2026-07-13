// Pure billing math, kept out of the webhook handler so it is unit-testable.

/**
 * Credits to reverse for a (possibly partial) refund. Proportional to the
 * refunded share of the payment, rounded down, capped at the purchase's
 * credits. A zero/unknown total reverses everything (fail safe for us).
 */
export function refundCreditsToReverse(
  purchasedCredits: number,
  totalCents: number,
  refundedCents: number,
): number {
  if (totalCents <= 0) return purchasedCredits;
  return Math.min(purchasedCredits, Math.floor((purchasedCredits * refundedCents) / totalCents));
}

/**
 * How many MORE credits to reverse right now, given the cumulative target
 * (from refundCreditsToReverse) and what prior reversal ledger entries for
 * this purchase already took back. Stripe's charge.amount_refunded is
 * cumulative, so a second partial refund arrives as a larger total — the
 * delta is what's still owed. Never negative: an earlier over-reversal
 * (e.g. a chargeback) is not "paid back".
 */
export function reversalDelta(targetReversal: number, alreadyReversed: number): number {
  return Math.max(0, targetReversal - alreadyReversed);
}
