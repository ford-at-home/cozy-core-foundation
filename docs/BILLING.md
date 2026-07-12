# Billing — credits, Stripe, and money operations

One credit = one completed generation. A deep-research start ("Research it
for me") uses 2 credits because it runs deep research plus the chained
compose. New users get 3 credits on signup. Credits are held when a
generation is dispatched and **consumed only when it completes**; failed,
cancelled, and stuck runs release the hold automatically.

## Money rules (do not break these)

- **Stripe is the source of truth for payment state.** Postgres is the
  source of truth for credit history and access decisions.
- The **ledger is append-only** (`credit_ledger`). Corrections are new
  entries; nothing is ever edited or deleted. `credit_accounts.balance` is a
  projection: `SUM(ledger) − SUM(held reservations)`, floored at 0 when a
  refund reverses already-spent credits.
- All balance mutation happens in SECURITY DEFINER Postgres functions
  (`grant_credits`, `reserve_credits`, `settle_reservation`,
  `release_reservation`, `admin_adjust_credits`) that only `service_role`
  can execute. Clients get SELECT on their own rows and nothing else.
- **Credits are granted only by the verified Stripe webhook** (or the
  reconciler re-checking Stripe directly). The `/billing?status=success`
  redirect is cosmetic and grants nothing.
- The client never submits a price or amount — `create-checkout-session`
  validates the price id against the `credit_products` table.
- Every grant/consumption has an idempotency key; duplicate webhooks,
  double-clicks, retries, and re-sweeps cannot double-charge or
  double-grant.

## Secrets (never in code, git, VITE_*, or logs)

Set in **Supabase Edge Function secrets** (Lovable Cloud → backend secrets):

| Secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-side Stripe API calls (`sk_test_…` first, `sk_live_…` only after the full test-mode pass) |
| `STRIPE_WEBHOOK_SECRET` | Signature verification in `stripe-webhook` (`whsec_…`, per endpoint per mode) |
| `APP_PUBLIC_URL` | Deployed app origin for Checkout success/cancel URLs (e.g. `https://<app>.lovable.app`) |
| `CREDITS_MODE` | Optional. `enforce` (default) blocks dispatch when credits run out; `log` observes without blocking — the incident rollback lever |

The frontend needs **no Stripe key at all**: the browser is redirected to a
server-created, Stripe-hosted Checkout URL. No card data ever touches the
app.

## Manual configuration checklist (owner)

**Stripe (test mode first):**

1. Create three Products with one Price each (one-time, USD): Starter
   5 credits / $10, Writer 20 credits / $32, Studio 50 credits / $70.
   (Prices are provisional until real cost telemetry accumulates.)
2. Copy each **Price id** (`price_…`, not the product id) into
   `credit_products` and activate:
   ```sql
   UPDATE credit_products SET stripe_price_id = 'price_…', active = true WHERE name = 'Starter';
   UPDATE credit_products SET stripe_price_id = 'price_…', active = true WHERE name = 'Writer';
   UPDATE credit_products SET stripe_price_id = 'price_…', active = true WHERE name = 'Studio';
   ```
3. Add a webhook endpoint
   `https://dlaojinagezrlbwyritd.supabase.co/functions/v1/stripe-webhook`
   with events: `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`.
4. Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`, and the
   test secret key into `STRIPE_SECRET_KEY`. Set `APP_PUBLIC_URL`.
5. Repeat 3–4 with live keys **only after** the full test plan below passes.

**Supabase:** enable email confirmation and captcha on signup (reduces
free-credit farming), verify leaked-password protection, and confirm
migration `20260712140000_credit_ledger.sql` applied (existing users are
backfilled with the 3-credit signup grant).

## Test plan (test mode; all must pass before live keys)

Automated (run locally / CI):

```sh
deno test --allow-env supabase/functions/_tests/          # unit suite
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/credits.test.sql   # SQL invariants
DATABASE_URL="$DB" supabase/tests/credit-concurrency.sh   # concurrent-spend race
```

Stripe CLI pass (`stripe listen --forward-to <fn-url>/stripe-webhook`):

- Successful checkout with card `4242 4242 4242 4242` → purchase
  `completed`, `+credits` ledger entry, balance chip updates.
- `stripe trigger checkout.session.completed` **twice** with the same event
  → one grant (inbox dedup + idempotent key).
- Canceled checkout (back button) → `/billing?status=canceled`, purchase
  stays `pending`, later `expired`; no grant.
- Failing card `4000 0000 0000 0002` → no completed event, no grant.
- Delayed payment method → `completed` (unpaid, skipped) then
  `async_payment_succeeded` → single grant.
- Invalid signature (`curl` with garbage `stripe-signature`) → 401, no
  inbox row.
- `stripe trigger charge.refunded` → purchase `refunded`, negative ledger
  entry, balance floors at 0 if already spent.
- `stripe trigger charge.dispute.created` → purchase `disputed`,
  chargeback reversal entry.
- Kill the webhook listener, pay, wait >1h (or temporarily lower the grace
  window) → the reconciler heals the grant from Stripe directly.
- Mobile: complete a checkout from a phone; the return flow must land on
  `/billing?status=success` and the balance must update within seconds.

Product-side:

- Signup → exactly 3 credits, once (re-login, profile edits, replays grant
  nothing — verified by `credits.test.sql`).
- Spend to 0 → generation buttons become "Get credits" CTAs; direct edge
  function invocation returns 402.
- Failed/cancelled/stuck generation → hold released, banner on the run page.
- Two tabs racing the last credit → one wins (verified by
  `credit-concurrency.sh`).

## Operations runbook

**Why does this user have this balance?**

```sql
SELECT created_at, entry_type, amount, reason, run_id, purchase_id, idempotency_key
FROM credit_ledger WHERE user_id = '<uuid>' ORDER BY created_at DESC;

SELECT r.run_id, r.amount, r.status, r.created_at, r.resolved_at, a.status AS run_status
FROM credit_reservations r JOIN agent_runs a ON a.id = r.run_id
WHERE r.user_id = '<uuid>' ORDER BY r.created_at DESC;
```

**Was the webhook received/processed?**

```sql
SELECT id, type, status, error, received_at, processed_at
FROM stripe_events ORDER BY received_at DESC LIMIT 50;
```

Events in `error` are retried by Stripe automatically (the handler returns
5xx); they can also be replayed safely from the Stripe dashboard ("Resend")
because processing is idempotent.

**Grant or remove credits (always with a reason — never UPDATE a balance):**

```sql
SELECT admin_adjust_credits('<user uuid>', 5, 'support: lost generation',
                            'admin:you@example.com', 'adm:<ticket-id>');
```

**Consistency checks:**

```sql
-- Projection vs ledger (nonzero drift = a refund floored at 0, or a bug):
SELECT a.user_id, a.balance,
       COALESCE(l.total, 0) - COALESCE(h.held, 0) AS derived
FROM credit_accounts a
LEFT JOIN (SELECT user_id, SUM(amount) total FROM credit_ledger GROUP BY 1) l USING (user_id)
LEFT JOIN (SELECT user_id, SUM(amount) held FROM credit_reservations
           WHERE status = 'held' GROUP BY 1) h USING (user_id)
WHERE a.balance <> GREATEST(0, COALESCE(l.total, 0) - COALESCE(h.held, 0));

-- Purchases stuck pending (the reconciler also heals these hourly):
SELECT * FROM purchases WHERE status = 'pending' AND created_at < now() - interval '1 hour';
```

**Incident lever:** set `CREDITS_MODE=log` in edge function secrets to stop
blocking generations (usage is still metered and recorded); unset to
re-enforce.

## Failure scenarios (authoritative state → recovery)

- **Payment succeeds, redirect fails** → webhook already granted; balance is
  correct on next load.
- **Webhook delayed/lost** → purchase stays `pending`; success page says
  credits are on the way; Stripe retries for days and the reconciler heals
  from Stripe after 1h regardless.
- **Duplicate / out-of-order events** → inbox PK + idempotent grants; each
  handler re-reads current DB state.
- **Run crashes after reserve** → reconciler's stuck-run timeouts fail the
  run and release the hold; a 1h reservation sweep is the belt-and-braces.
- **Generation succeeds but the client times out** → settlement is
  server-side; the run page shows the result on revisit.
- **Refund after credits were spent** → full reversal in the ledger, balance
  floors at 0; drift shows in the consistency query for follow-up.
- **Stripe down** → checkout creation fails visibly (nothing granted, at
  most a pending purchase); generations are unaffected.
- **Supabase down** → Stripe retries webhooks automatically once it is back.
