// Stripe-vs-ledger reconciliation, run from the reconcile-runs sweep.
//
// Two invariants are repaired/flagged:
//   1. A purchase stuck `pending` past the grace window is checked against
//      Stripe directly: paid sessions are granted (self-healing — the same
//      idempotent key the webhook uses), expired sessions are closed out.
//   2. A purchase marked `completed` with no matching ledger entry gets its
//      grant re-issued (idempotent, so this is safe even on a false alarm).
//
// This makes lost webhooks a latency problem instead of a money problem.

// deno-lint-ignore-file no-explicit-any
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { logEvent } from "./observability.ts";

const FN = "stripe-reconcile";
const PENDING_GRACE_MS = 60 * 60 * 1000; // webhook should land within an hour

export async function reconcilePurchases(
  admin: any,
): Promise<{ healed: number; expired: number; flagged: number }> {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const out = { healed: 0, expired: 0, flagged: 0 };
  if (!key) return out; // payments not configured — nothing to reconcile

  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  // --- 1. Stale pending purchases: ask Stripe what actually happened -------
  const cutoff = new Date(Date.now() - PENDING_GRACE_MS).toISOString();
  const { data: stale } = await admin
    .from("purchases")
    .select("id, user_id, credits, stripe_checkout_session_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(20);

  for (const purchase of stale ?? []) {
    try {
      const session = await stripe.checkout.sessions.retrieve(purchase.stripe_checkout_session_id);
      if (session.payment_status === "paid") {
        // Webhook never landed (or failed): grant with the same idempotent
        // key the webhook would have used.
        const { error } = await admin.rpc("grant_credits", {
          _user_id: purchase.user_id,
          _amount: purchase.credits,
          _entry_type: "purchase",
          _idempotency_key: `purchase:${session.id}`,
          _purchase_id: purchase.id,
          _actor: "reconciler",
          _reason: "Reconciliation: paid session with no webhook grant",
        });
        if (error) throw new Error(error.message);
        await admin
          .from("purchases")
          .update({
            status: "completed",
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : (session.payment_intent?.id ?? null),
            amount_total_cents: session.amount_total ?? null,
            currency: session.currency ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", purchase.id);
        out.healed++;
        logEvent(FN, "warn", {
          event: "healed_missing_grant",
          purchaseId: purchase.id,
          sessionId: session.id,
        });
      } else if (session.status === "expired") {
        await admin
          .from("purchases")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", purchase.id);
        out.expired++;
      } else {
        // Still open at Stripe (delayed payment method, abandoned tab):
        // leave pending; Checkout sessions expire on their own within 24h.
        out.flagged++;
      }
    } catch (err) {
      out.flagged++;
      logEvent(FN, "error", {
        event: "reconcile_purchase_failed",
        purchaseId: purchase.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --- 2. Completed purchases whose ledger entry is missing ---------------
  const { data: recent } = await admin
    .from("purchases")
    .select("id, user_id, credits, stripe_checkout_session_id")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);
  if ((recent ?? []).length > 0) {
    const keys = (recent ?? []).map((p: any) => `purchase:${p.stripe_checkout_session_id}`);
    const { data: entries } = await admin
      .from("credit_ledger")
      .select("idempotency_key")
      .in("idempotency_key", keys);
    const granted = new Set((entries ?? []).map((e: any) => e.idempotency_key));
    for (const p of recent ?? []) {
      const k = `purchase:${p.stripe_checkout_session_id}`;
      if (granted.has(k)) continue;
      const { error } = await admin.rpc("grant_credits", {
        _user_id: p.user_id,
        _amount: p.credits,
        _entry_type: "purchase",
        _idempotency_key: k,
        _purchase_id: p.id,
        _actor: "reconciler",
        _reason: "Reconciliation: completed purchase missing its ledger entry",
      });
      if (error) {
        out.flagged++;
        logEvent(FN, "error", {
          event: "regrant_failed",
          purchaseId: p.id,
          message: error.message,
        });
      } else {
        out.healed++;
        logEvent(FN, "warn", { event: "healed_missing_ledger_entry", purchaseId: p.id });
      }
    }
  }

  return out;
}
