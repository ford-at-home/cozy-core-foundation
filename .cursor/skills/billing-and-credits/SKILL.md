---
name: billing-and-credits
description: Change anything money-adjacent — credit packs, the credit ledger, reservations, Stripe checkout, the Stripe webhook, purchase records, refunds/chargebacks, the paywall, or the billing page. Use for tasks mentioning credits, balance, checkout, Stripe, prices, purchases, paywall, refunds, or "Get credits". The detailed money rules live in docs/BILLING.md; this skill routes you to them and to the code that implements them.
---

# billing-and-credits

## Purpose

Change billing behavior without violating the money rules in
`docs/BILLING.md`: Stripe is the source of truth for payment state, Postgres
(the append-only `credit_ledger`) is the source of truth for credit history,
and every grant/consumption is idempotent. This skill is deliberately thin —
**read `docs/BILLING.md` in full before changing anything**; it is the
authoritative document. This skill adds the repository map, the procedure,
and the cross-skill routing.

## The credit model (as implemented)

- One credit = one **completed** generation; deep research holds 2 (covers
  the chained compose via `agent_runs.parent_run_id`). Costs:
  `CREDIT_COST` in `supabase/functions/_shared/credits.ts`, mirrored in
  `src/lib/use-credits.ts` — change both together or neither.
- Research-packet workflow costs (the full table is `docs/BILLING.md` →
  "What costs what"): follow-up research 2, final Word document 2,
  presentation 2 — each a local `const COST` in its Edge Function
  (`run-follow-up-research`, `create-final-document-job`,
  `create-presentation-job`) mirrored by `FOLLOWUP_RESEARCH_COST` /
  `FINAL_ARTIFACT_COST` in `src/lib/followup.functions.ts` /
  `src/lib/final-artifacts.functions.ts`. `tests/billing-boundaries.test.ts`
  fails on drift. Returning work, recognition, verification, question
  approval, and downloads are free.
- Signup grants 3 credits, idempotent by construction
  (`handle_new_user` trigger, key `signup:{user_id}`).
- Holds are placed **before dispatch** (`start-workflow`, `piece-action`)
  and resolved exactly once at a terminal run transition: completed →
  settle, failed/cancelled/stuck → release. The reconciler
  (`reconcile-runs`) sweeps stale holds and heals pending purchases.
- Printing, downloading, or re-viewing an existing artifact is **free**;
  credits attach to generation only (see `print-artifact-fidelity`).
- Purchases: `create-checkout-session` (validates the price id against
  `credit_products`; the client never supplies a price) → Stripe-hosted
  Checkout → `stripe-webhook` (signature-verified, `stripe_events` inbox
  dedup) grants credits. The `/billing?status=success` redirect is cosmetic
  and grants nothing. Packs only — the `subscriptions` table is schema-ready
  but has no flow or UI.

## Use this skill when

- Changing checkout, the Stripe webhook, purchase/refund/chargeback
  handling, `credit_products`, or `_shared/stripe-reconcile.ts`.
- Changing the ledger, reservations, grants, or the SECURITY DEFINER money
  functions in `supabase/migrations/20260712140000_credit_ledger.sql`.
- Changing the paywall, the billing page (`src/routes/_authenticated/billing.tsx`),
  the balance chip (`src/components/CreditBalance.tsx`), or `src/lib/use-credits.ts`.
- Changing what an action costs, or making a new action billable.

## Combine with (multi-skill routing)

- Reservation/settlement timing, run states, webhooks, the reconciler →
  **`run-orchestration-change`** (the credit lifecycle is the run lifecycle).
- Migrations, RLS, new billing tables, edge-function config →
  **`supabase-change`**.
- Billing/paywall/checkout UI layout or copy → **`mobile-ui-polish`**
  (and `docs/brand/` for terminology).
- A new billable artifact type → also **`print-artifact-fidelity`** if it
  prints.
- Release prep for anything billing-adjacent → **`production-readiness`**
  plus the Stripe test-mode plan in `docs/BILLING.md`.

## Invariants (from docs/BILLING.md — non-negotiable)

1. Ledger is append-only; corrections are new entries. Balance mutations only
   through the SECURITY DEFINER functions (`grant_credits`, `reserve_credits`,
   `settle_reservation`, `release_reservation`, `admin_adjust_credits`),
   executable only by `service_role`.
2. Credits are granted **only** by the verified Stripe webhook or the Stripe
   reconciler — never from a redirect, never client-side.
3. The client never supplies a price, amount, or balance. The UI balance is
   display state read from RLS-protected `credit_accounts`.
4. Every grant/consumption/reservation carries an idempotency key; duplicate
   webhooks, retries, and re-sweeps must be no-ops.
5. Every path that places a hold must have a release path for
   failure/cancel/stuck — no stranded holds.
6. Stripe secrets stay in edge-function secrets; the frontend has no Stripe
   key at all (`scripts/check-secrets.sh` enforces this).

## Procedure

1. Read `docs/BILLING.md` in full. Then read the code you're changing plus
   `supabase/functions/_shared/credits.ts` (the lifecycle adapter).
2. Trace the money movement end to end for your change: who writes the
   ledger entry, under which idempotency key, and what redelivery does.
3. If reservation/settlement timing or run states are involved, apply
   `run-orchestration-change` — do not shortcut its state-machine rules.
4. If schema changes: `supabase-change` conventions; billing tables keep the
   established pattern (client SELECT-own-rows at most; `stripe_events`
   stays deny-all; money functions stay REVOKEd from `authenticated`).
5. Update tests with the change: `supabase/functions/_tests/credits.test.ts`
   / `stripe-webhook.test.ts` (Deno), `supabase/tests/credits.test.sql`
   (live DB), and the UI paywall states if display changed.

## Validation

- [ ] `npm run test:functions` — Deno suite including duplicate-delivery
      cases for anything you touched.
- [ ] `bash scripts/check-secrets.sh` — no Stripe/service-role material
      reaches the client bundle.
- [ ] If SQL changed: `bash scripts/check-migrations.sh`; run
      `supabase/tests/credits.test.sql` and
      `supabase/tests/credit-concurrency.sh` against a live non-production DB,
      or list them as required manual actions.
- [ ] If UI changed: `npm run lint && npm run typecheck && npm test && npm run build`,
      and check the paywall states at 375px (see `mobile-ui-polish`).
- [ ] Before live keys: the full Stripe CLI test plan in `docs/BILLING.md`.

Use the `backend-integrity-reviewer` subagent for independent review —
billing changes are never self-certified.

## Failure modes

- Granting credits anywhere except the verified webhook/reconciler path
  (especially from the `/billing?status=success` redirect).
- Writing `credit_ledger`/`credit_accounts` directly instead of calling the
  SECURITY DEFINER functions.
- A new billable path that reserves without a guaranteed release on failure.
- Treating `checkout.session.completed` as paid without checking
  `payment_status` (async payment methods complete unpaid first).
- Changing `CREDIT_COST` in one of its two locations only.
- Documenting product ids where the code requires **price** ids
  (`credit_products.stripe_price_id`).

## References

- `docs/BILLING.md` — money rules, secrets, owner checklist, test plan,
  operations runbook (authoritative)
- `docs/ARCHITECTURE.md` → Credits and Stripe billing
- `supabase/migrations/20260712140000_credit_ledger.sql` — schema + functions
- `supabase/functions/_shared/credits.ts`, `_shared/billing.ts`,
  `_shared/stripe-reconcile.ts`
- `supabase/functions/create-checkout-session/index.ts`,
  `supabase/functions/stripe-webhook/index.ts`
- `src/routes/_authenticated/billing.tsx`, `src/components/CreditBalance.tsx`,
  `src/lib/use-credits.ts`, `src/lib/billing.functions.ts`
