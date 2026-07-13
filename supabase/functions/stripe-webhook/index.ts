// Edge function: stripe-webhook — the ONLY path that turns money into
// credits.
//
// JWT verification is DISABLED for this function (supabase/config.toml):
// Stripe sends no Supabase JWT. Authentication is the Stripe signature over
// the raw body with STRIPE_WEBHOOK_SECRET.
//
// Rules (docs/BILLING.md, same discipline as cursor-webhook):
//   - Verify the signature on the raw bytes BEFORE parsing.
//   - Inbox first: stripe_events PK = Stripe event id, so duplicate delivery
//     is detected before any side effect. Events that previously failed are
//     reprocessed; events already processed are acked and skipped.
//   - Grants are idempotent ledger inserts (key purchase:{session_id}), so
//     even a bug above this layer cannot double-credit.
//   - Out-of-order tolerant: every handler re-reads current DB state.
//   - 2xx for handled/duplicate/irrelevant; 5xx only for transient failures
//     so Stripe retries them.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { logEvent } from "../_shared/observability.ts";
import { refundCreditsToReverse, reversalDelta } from "../_shared/billing.ts";

const FN = "stripe-webhook";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response("server misconfigured", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Raw body FIRST — the signature covers these exact bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    logEvent(FN, "warn", {
      event: "bad_signature",
      message: err instanceof Error ? err.message : String(err),
    });
    return new Response("invalid signature", { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Inbox: PK dedup. Already-processed events are acked without side effects;
  // previously-errored events fall through and are reprocessed.
  const { error: insertErr } = await admin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: existing } = await admin
        .from("stripe_events")
        .select("status")
        .eq("id", event.id)
        .maybeSingle();
      if (existing?.status === "processed" || existing?.status === "skipped") {
        return new Response("duplicate", { status: 200 });
      }
      // received/error: a prior attempt did not finish — reprocess below.
    } else {
      logEvent(FN, "error", { event: "inbox_insert_failed", message: insertErr.message });
      return new Response("inbox write failed", { status: 500 }); // Stripe retries
    }
  }

  try {
    const outcome = await processEvent(admin, event);
    await admin
      .from("stripe_events")
      .update({ status: outcome, processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    logEvent(FN, "info", {
      event: "processed",
      stripeEventId: event.id,
      type: event.type,
      outcome,
    });
    return new Response("ok", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("stripe_events")
      .update({ status: "error", error: message, processed_at: new Date().toISOString() })
      .eq("id", event.id);
    logEvent(FN, "error", {
      event: "process_failed",
      stripeEventId: event.id,
      type: event.type,
      message,
    });
    return new Response("processing failed", { status: 500 }); // Stripe retries
  }
});

async function processEvent(admin: any, event: Stripe.Event): Promise<"processed" | "skipped"> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return await handleCheckoutPaid(admin, event);
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return await handleCheckoutNotPaid(admin, event);
    case "charge.refunded":
      return await handleChargeRefunded(admin, event);
    case "charge.dispute.created":
      return await handleDispute(admin, event);
    default:
      return "skipped"; // irrelevant event type — ack so Stripe stops retrying
  }
}

async function handleCheckoutPaid(
  admin: any,
  event: Stripe.Event,
): Promise<"processed" | "skipped"> {
  const session = event.data.object as Stripe.Checkout.Session;
  // checkout.session.completed also fires for delayed payment methods that
  // are not paid yet; those grant on async_payment_succeeded instead.
  if (session.payment_status !== "paid") return "skipped";

  const { data: purchase } = await admin
    .from("purchases")
    .select("id, user_id, credits, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  // Sessions we did not create (or a lost purchase row): fall back to the
  // metadata written by create-checkout-session so payment is never dropped.
  const userId = purchase?.user_id ?? session.metadata?.user_id ?? session.client_reference_id;
  const credits = purchase?.credits ?? Number(session.metadata?.credits ?? 0);
  if (!userId || !Number.isInteger(credits) || credits <= 0) {
    throw new Error(`cannot resolve user/credits for session ${session.id}`);
  }

  if (purchase) {
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
  }

  // The idempotency key makes redelivery and completed+async double-fire safe.
  const { error } = await admin.rpc("grant_credits", {
    _user_id: userId,
    _amount: credits,
    _entry_type: "purchase",
    _idempotency_key: `purchase:${session.id}`,
    _stripe_event_id: event.id,
    _purchase_id: purchase?.id ?? null,
    _actor: "stripe_webhook",
    _reason: `Credit pack purchase (${credits} credits)`,
  });
  if (error) throw new Error(`grant failed: ${error.message}`);
  return "processed";
}

async function handleCheckoutNotPaid(
  admin: any,
  event: Stripe.Event,
): Promise<"processed" | "skipped"> {
  const session = event.data.object as Stripe.Checkout.Session;
  const { data: purchase } = await admin
    .from("purchases")
    .select("id, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (!purchase || purchase.status !== "pending") return "skipped";
  await admin
    .from("purchases")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", purchase.id);
  return "processed";
}

async function handleChargeRefunded(
  admin: any,
  event: Stripe.Event,
): Promise<"processed" | "skipped"> {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return "skipped";

  const { data: purchase } = await admin
    .from("purchases")
    .select("id, user_id, credits, amount_total_cents, status")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!purchase) return "skipped"; // not one of our credit purchases

  // Partial refunds reverse a proportional share (rounded down); a full
  // refund reverses everything. charge.amount_refunded is CUMULATIVE, so a
  // second partial refund on the same charge must reverse only the delta
  // beyond what earlier refund/chargeback events already took back. The
  // balance floors at 0 if already spent — the ledger records the full
  // reversal either way.
  const total = purchase.amount_total_cents ?? charge.amount;
  const refunded = charge.amount_refunded;
  const targetReversal = refundCreditsToReverse(purchase.credits, total, refunded);
  const alreadyReversed = await creditsAlreadyReversed(admin, purchase.id);
  const reverseCredits = reversalDelta(targetReversal, alreadyReversed);
  if (reverseCredits <= 0) return "skipped";

  await admin
    .from("purchases")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", purchase.id);

  // Key includes the cumulative refunded amount so each successive partial
  // refund gets its own ledger entry, while redelivery of the same event
  // (same cumulative amount) still dedups.
  const { error } = await admin.rpc("grant_credits", {
    _user_id: purchase.user_id,
    _amount: -reverseCredits,
    _entry_type: "refund_reversal",
    _idempotency_key: `refund:${charge.id}:${refunded}`,
    _stripe_event_id: event.id,
    _purchase_id: purchase.id,
    _actor: "stripe_webhook",
    _reason: `Refund of ${refunded} / ${total} cents`,
  });
  if (error) throw new Error(`refund reversal failed: ${error.message}`);
  return "processed";
}

/** Credits already taken back for this purchase (refunds + chargebacks). */
async function creditsAlreadyReversed(admin: any, purchaseId: string): Promise<number> {
  const { data, error } = await admin
    .from("credit_ledger")
    .select("amount, entry_type")
    .eq("purchase_id", purchaseId)
    .in("entry_type", ["refund_reversal", "chargeback_reversal"]);
  if (error) throw new Error(`reversal lookup failed: ${error.message}`);
  return (data ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + Math.abs(row.amount),
    0,
  );
}

async function handleDispute(admin: any, event: Stripe.Event): Promise<"processed" | "skipped"> {
  const dispute = event.data.object as Stripe.Dispute;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!paymentIntentId) return "skipped";

  const { data: purchase } = await admin
    .from("purchases")
    .select("id, user_id, credits")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!purchase) return "skipped";

  await admin
    .from("purchases")
    .update({ status: "disputed", updated_at: new Date().toISOString() })
    .eq("id", purchase.id);

  // A dispute takes back the whole purchase, but never more than what prior
  // refund reversals left standing — refund-then-dispute must not over-reverse.
  const alreadyReversed = await creditsAlreadyReversed(admin, purchase.id);
  const reverseCredits = reversalDelta(purchase.credits, alreadyReversed);
  if (reverseCredits <= 0) return "processed"; // fully reversed already; status update stands

  const { error } = await admin.rpc("grant_credits", {
    _user_id: purchase.user_id,
    _amount: -reverseCredits,
    _entry_type: "chargeback_reversal",
    _idempotency_key: `dispute:${dispute.id}`,
    _stripe_event_id: event.id,
    _purchase_id: purchase.id,
    _actor: "stripe_webhook",
    _reason: `Chargeback dispute ${dispute.id}`,
  });
  if (error) throw new Error(`chargeback reversal failed: ${error.message}`);
  return "processed";
}
