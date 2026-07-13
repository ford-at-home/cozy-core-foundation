// Pure decision logic for the Stripe webhook, kept out of the handler so the
// money-critical branches are unit-testable (same pattern as billing.ts).

/** stripe_events.status values (inbox table). */
export type StripeInboxStatus = "received" | "processed" | "skipped" | "error";

/**
 * Duplicate-delivery decision. Events whose prior attempt finished
 * (`processed`/`skipped`) are acked without side effects; an interrupted
 * attempt (`received`/`error`, or a row we cannot read) is reprocessed —
 * every handler is idempotent, so reprocessing is always safe.
 */
export function shouldReprocessDuplicate(
  status: StripeInboxStatus | string | null | undefined,
): boolean {
  return status !== "processed" && status !== "skipped";
}

export interface CheckoutBeneficiary {
  userId: string;
  credits: number;
}

/**
 * Resolve who gets how many credits for a *paid* checkout session. The
 * purchase row written by create-checkout-session is authoritative; the
 * session metadata (also written by create-checkout-session) is the fallback
 * so a lost purchase row never drops a payment. Returns null when neither
 * source resolves a valid grant — the caller must treat that as an error
 * (5xx so Stripe retries), never as a silent skip.
 */
export function resolveCheckoutBeneficiary(
  session: {
    metadata?: Record<string, string> | null;
    client_reference_id?: string | null;
  },
  purchase: { user_id: string; credits: number } | null,
): CheckoutBeneficiary | null {
  const userId = purchase?.user_id ?? session.metadata?.user_id ?? session.client_reference_id;
  const credits = purchase?.credits ?? Number(session.metadata?.credits ?? 0);
  if (!userId || !Number.isInteger(credits) || credits <= 0) return null;
  return { userId, credits };
}
