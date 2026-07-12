// Edge function: create-checkout-session — server-side start of a credit
// pack purchase.
//
// Rules (docs/BILLING.md):
//   - The client sends only a price id; it is validated against the active
//     credit_products rows. No client-supplied amount or credit count is
//     ever trusted.
//   - Stripe-hosted Checkout collects payment; no card data touches us.
//   - A pending `purchases` row is written before returning the URL. The
//     redirect back to /billing is UX only — credits are granted exclusively
//     by the verified stripe-webhook event.
//   - Stripe call carries an idempotency key derived from user + requestId,
//     so a double-click cannot open two sessions.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0?target=denonext";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  logEvent,
  newRequestId,
} from "../_shared/observability.ts";

const FN = "create-checkout-session";
const err = (
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
) => errorResponse(FN, status, message, opts);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const rid = newRequestId();
  if (req.method !== "POST") return err(405, "Method not allowed", { requestId: rid });
  try {
    return await handle(req, rid);
  } catch (e) {
    return err(500, "Unhandled server error", { requestId: rid, code: "unhandled", cause: e });
  }
});

async function handle(req: Request, rid: string): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    return err(500, "Server misconfigured", { requestId: rid, code: "env_missing" });
  }
  if (!STRIPE_SECRET_KEY) {
    return err(503, "Payments are not configured yet.", {
      requestId: rid,
      code: "payments_disabled",
    });
  }

  // --- 1. Authenticate the caller -----------------------------------------
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return err(401, "Unauthorized", { requestId: rid, code: "no_token" });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return err(401, "Unauthorized", { requestId: rid, code: "invalid_token", cause: userErr });
  }
  const userId = userData.user.id;
  const email = userData.user.email ?? undefined;

  // --- 2. Validate the requested pack against our catalog ------------------
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const priceId = typeof body?.priceId === "string" ? body.priceId : "";
  const requestId =
    typeof body?.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  if (!priceId) return err(400, "priceId is required", { requestId: rid, code: "no_price" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: product } = await admin
    .from("credit_products")
    .select("stripe_price_id, name, credits")
    .eq("stripe_price_id", priceId)
    .eq("active", true)
    .maybeSingle();
  if (!product) {
    return err(400, "Unknown or inactive credit pack.", { requestId: rid, code: "bad_price" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  // --- 3. Ensure the Stripe customer mapping -------------------------------
  let stripeCustomerId: string;
  const { data: existing } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    stripeCustomerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create(
      { email, metadata: { user_id: userId } },
      { idempotencyKey: `customer:${userId}` },
    );
    stripeCustomerId = customer.id;
    const { error: insertErr } = await admin
      .from("billing_customers")
      .insert({ user_id: userId, stripe_customer_id: stripeCustomerId, email: email ?? null });
    if (insertErr) {
      // Concurrent request won the race; use its mapping.
      const { data: raced } = await admin
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (raced) stripeCustomerId = raced.stripe_customer_id;
    }
  }

  // --- 4. Create the Checkout Session (idempotent on user+requestId) -------
  const appUrl = (Deno.env.get("APP_PUBLIC_URL") ?? req.headers.get("origin") ?? "").replace(
    /\/$/,
    "",
  );
  if (!appUrl) {
    return err(500, "APP_PUBLIC_URL is not configured", { requestId: rid, code: "no_app_url" });
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      metadata: { user_id: userId, credits: String(product.credits), price_id: priceId },
      success_url: `${appUrl}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?status=canceled`,
    },
    { idempotencyKey: `checkout:${userId}:${requestId}` },
  );

  // --- 5. Record the pending purchase BEFORE returning the URL -------------
  const { error: purchaseErr } = await admin.from("purchases").insert({
    user_id: userId,
    stripe_checkout_session_id: session.id,
    stripe_price_id: priceId,
    credits: product.credits,
    amount_total_cents: session.amount_total ?? null,
    currency: session.currency ?? null,
    status: "pending",
  });
  if (purchaseErr && purchaseErr.code !== "23505") {
    // A purchase row we cannot write is a purchase we cannot reconcile.
    return err(500, purchaseErr.message, {
      requestId: rid,
      code: "purchase_insert_failed",
      cause: purchaseErr,
    });
  }

  logEvent(FN, "info", {
    requestId: rid,
    event: "checkout_created",
    userId,
    sessionId: session.id,
    priceId,
    credits: product.credits,
  });
  return jsonResponse({ url: session.url }, 200, rid);
}
