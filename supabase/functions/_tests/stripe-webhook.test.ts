// Cross-feature boundary tests for the money → credits path: signature
// verification, duplicate-delivery dedup decisions, beneficiary resolution,
// and refund reversal math. The live-DB effects of these decisions are
// covered by supabase/tests/credits.test.sql.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import { refundCreditsToReverse } from "../_shared/billing.ts";
import { resolveCheckoutBeneficiary, shouldReprocessDuplicate } from "../_shared/stripe-events.ts";

// ---------------------------------------------------------------------------
// Signature verification — the webhook's entire auth model (verify_jwt=false).
// Uses the same stripe library + SubtleCryptoProvider as the handler.
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";
const cryptoProvider = Stripe.createSubtleCryptoProvider();
// No network calls are made: only the webhooks namespace is used.
const stripe = new Stripe("sk_test_dummy_key_never_used", {
  httpClient: Stripe.createFetchHttpClient(),
});

const eventPayload = JSON.stringify({
  id: "evt_test_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", payment_status: "paid" } },
});

async function signedHeader(payload: string, secret: string): Promise<string> {
  // Stripe signature scheme: v1 = HMAC-SHA256(secret, `${timestamp}.${payload}`).
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

Deno.test("webhook accepts a correctly signed event", async () => {
  const header = await signedHeader(eventPayload, WEBHOOK_SECRET);
  const event = await stripe.webhooks.constructEventAsync(
    eventPayload,
    header,
    WEBHOOK_SECRET,
    undefined,
    cryptoProvider,
  );
  assertEquals(event.id, "evt_test_1");
  assertEquals(event.type, "checkout.session.completed");
});

Deno.test("webhook rejects an unsigned or garbage-signed event", async () => {
  await assertRejects(() =>
    stripe.webhooks.constructEventAsync(
      eventPayload,
      "t=1,v1=deadbeef",
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    ),
  );
});

Deno.test("webhook rejects a tampered payload signed for different bytes", async () => {
  const header = await signedHeader(eventPayload, WEBHOOK_SECRET);
  const tampered = eventPayload.replace('"payment_status":"paid"', '"payment_status":"unpaid"');
  await assertRejects(() =>
    stripe.webhooks.constructEventAsync(
      tampered,
      header,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    ),
  );
});

Deno.test("webhook rejects an event signed with the wrong secret", async () => {
  const header = await signedHeader(eventPayload, "whsec_some_other_secret");
  await assertRejects(() =>
    stripe.webhooks.constructEventAsync(
      eventPayload,
      header,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    ),
  );
});

// ---------------------------------------------------------------------------
// Duplicate delivery — finished events are acked, interrupted ones reprocessed.
// Idempotent grants make reprocessing safe either way.
// ---------------------------------------------------------------------------

Deno.test("duplicate events that already finished are not reprocessed", () => {
  assertEquals(shouldReprocessDuplicate("processed"), false);
  assertEquals(shouldReprocessDuplicate("skipped"), false);
});

Deno.test("interrupted or unreadable prior attempts are reprocessed", () => {
  assertEquals(shouldReprocessDuplicate("received"), true);
  assertEquals(shouldReprocessDuplicate("error"), true);
  assertEquals(shouldReprocessDuplicate(null), true);
  assertEquals(shouldReprocessDuplicate(undefined), true);
});

// ---------------------------------------------------------------------------
// Beneficiary resolution — purchase row first, session metadata fallback,
// never a silent grant of zero/garbage credits.
// ---------------------------------------------------------------------------

Deno.test("purchase row is the authoritative grant source", () => {
  const grant = resolveCheckoutBeneficiary(
    { metadata: { user_id: "meta-user", credits: "999" } },
    { user_id: "row-user", credits: 20 },
  );
  assertEquals(grant, { userId: "row-user", credits: 20 });
});

Deno.test("session metadata recovers a lost purchase row", () => {
  const grant = resolveCheckoutBeneficiary(
    { metadata: { user_id: "meta-user", credits: "5" } },
    null,
  );
  assertEquals(grant, { userId: "meta-user", credits: 5 });
});

Deno.test("client_reference_id is the last-resort user source", () => {
  const grant = resolveCheckoutBeneficiary(
    { metadata: { credits: "5" }, client_reference_id: "ref-user" },
    null,
  );
  assertEquals(grant, { userId: "ref-user", credits: 5 });
});

Deno.test("unresolvable sessions return null (caller must error, not skip)", () => {
  assertEquals(resolveCheckoutBeneficiary({ metadata: {} }, null), null);
  assertEquals(resolveCheckoutBeneficiary({ metadata: { user_id: "u" } }, null), null);
  assertEquals(
    resolveCheckoutBeneficiary({ metadata: { user_id: "u", credits: "0" } }, null),
    null,
  );
  assertEquals(
    resolveCheckoutBeneficiary({ metadata: { user_id: "u", credits: "-3" } }, null),
    null,
  );
  assertEquals(
    resolveCheckoutBeneficiary({ metadata: { user_id: "u", credits: "2.5" } }, null),
    null,
  );
  assertEquals(
    resolveCheckoutBeneficiary({ metadata: { user_id: "u", credits: "twenty" } }, null),
    null,
  );
});

// ---------------------------------------------------------------------------
// Refund reversal math — proportional, floored, capped; unknown totals
// reverse everything (fail safe for us, ledger floors the balance at 0).
// ---------------------------------------------------------------------------

Deno.test("full refund reverses all purchased credits", () => {
  assertEquals(refundCreditsToReverse(20, 3200, 3200), 20);
});

Deno.test("partial refund reverses a proportional share, rounded down", () => {
  assertEquals(refundCreditsToReverse(20, 3200, 1600), 10);
  assertEquals(refundCreditsToReverse(5, 1000, 333), 1); // 1.665 → 1
  assertEquals(refundCreditsToReverse(5, 1000, 1), 0); // below one credit → nothing
});

Deno.test("reversal is capped at the purchase's credits", () => {
  assert(refundCreditsToReverse(20, 3200, 6400) <= 20);
});

Deno.test("zero/unknown total reverses everything", () => {
  assertEquals(refundCreditsToReverse(20, 0, 100), 20);
});
