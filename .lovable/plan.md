# Apply credit/payment backend

Repo already contains the reviewed implementation. This plan only applies it to the connected backend — no code changes, no schema edits, no frontend work.

## 1. Apply the migration

Run `supabase/migrations/20260712140000_credit_ledger.sql` exactly as written via the migration tool. It creates: `credit_accounts`, `credit_ledger`, `credit_reservations`, `billing_customers`, `purchases`, `stripe_events`, `credit_products`, `subscriptions`; adds `agent_runs.parent_run_id`; defines the SECURITY DEFINER functions (`grant_credits`, `reserve_credits`, `settle_reservation`, `release_reservation`, `admin_adjust_credits`) with EXECUTE revoked from anon+authenticated; installs the `on_auth_user_created` trigger (3-credit signup grant); enables RLS with owner-scoped SELECT-only policies; adds `credit_accounts` to `supabase_realtime`; and backfills grants for existing users.

Post-migration verification (read-only SQL):
- `on_auth_user_created` trigger exists on `auth.users`.
- Every `auth.users` row has a `credit_accounts` row with `balance >= 3`.
- New tables show RLS enabled.

## 2. Deploy edge functions

Deploy together so shared modules land in one bundle:
- New: `create-checkout-session`, `stripe-webhook`
- Redeploy (pick up updated `_shared/`): `start-workflow`, `piece-action`, `cursor-webhook`, `reconcile-runs`

`supabase/config.toml` already sets `verify_jwt = true` for `create-checkout-session` and `verify_jwt = false` for `stripe-webhook` (Stripe signature auth) — no changes.

## 3. Request secrets (secure UI)

Prompt via `add_secret` — never in chat/code:
- `STRIPE_SECRET_KEY` (test-mode `sk_test_…` first)
- `STRIPE_WEBHOOK_SECRET` (`whsec_…` from the Stripe dashboard webhook endpoint pointing at the deployed `stripe-webhook` URL)
- `APP_PUBLIC_URL` = `https://hardcopy.tools`

`CREDITS_MODE` stays unset (default: enforce).

Order: deploy `stripe-webhook` first so the URL is available to paste into Stripe, then request the secrets.

## 4. Auth hardening

Via `configure_auth`: enable leaked-password protection (`password_hibp_enabled: true`), keep signup enabled, keep anonymous disabled, do not auto-confirm email. Note to user: email confirmation and captcha toggles that aren't exposed by the tool must be enabled manually in the Auth settings UI (I will call these out with exact locations).

## Out of scope

No frontend edits. No changes to migration SQL, function bodies, table/function definitions, or `credit_products` rows — user will paste real Stripe price ids after creating products in Stripe (see `docs/BILLING.md`).
