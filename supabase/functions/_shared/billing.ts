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
