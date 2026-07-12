-- Credit ledger, reservations, and Stripe billing foundation.
--
-- Money rules (docs/BILLING.md):
--   * The ledger is APPEND-ONLY. Corrections are new entries, never edits.
--   * credit_accounts.balance is a projection:
--       balance = SUM(credit_ledger.amount) - SUM(held reservations)
--     (clamped at 0 when a refund/chargeback reverses already-spent credits).
--   * Every balance mutation goes through the SECURITY DEFINER functions
--     below, callable only by service_role (edge functions) and triggers.
--   * Clients get SELECT on their own rows and nothing else.

-- =====================================================================
-- 1. credit_accounts — balance projection, one row per user
-- =====================================================================
CREATE TABLE public.credit_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_accounts TO authenticated;
GRANT ALL ON public.credit_accounts TO service_role;

ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit account"
  ON public.credit_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Live balance updates for the UI chip.
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_accounts;

-- =====================================================================
-- 2. credit_ledger — immutable financial history
-- =====================================================================
-- Reference columns are plain ids (no FKs) on purpose: the financial log
-- must survive deletion of users, runs, and purchases.
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL CHECK (amount <> 0),
  entry_type text NOT NULL CHECK (entry_type IN (
    'signup_grant','purchase','promo_grant','subscription_grant',
    'consumption','refund_reversal','chargeback_reversal','expiration',
    'admin_adjustment'
  )),
  idempotency_key text NOT NULL UNIQUE,
  stripe_event_id text,
  purchase_id uuid,
  run_id uuid,
  reservation_id uuid,
  actor text NOT NULL DEFAULT 'system',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_ledger_user_created_idx
  ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX credit_ledger_stripe_event_idx
  ON public.credit_ledger (stripe_event_id) WHERE stripe_event_id IS NOT NULL;

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ledger entries"
  ON public.credit_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 3. credit_reservations — holds placed before dispatch
-- =====================================================================
-- One reservation per user-initiated run. For deep-research starts the
-- reservation attaches to the initiating research run and covers the
-- chained compose run (linked via agent_runs.parent_run_id).
CREATE TABLE public.credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid NOT NULL UNIQUE REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','settled','released')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX credit_reservations_user_idx
  ON public.credit_reservations (user_id, created_at DESC);
CREATE INDEX credit_reservations_held_idx
  ON public.credit_reservations (created_at) WHERE status = 'held';

GRANT SELECT ON public.credit_reservations TO authenticated;
GRANT ALL ON public.credit_reservations TO service_role;

ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own reservations"
  ON public.credit_reservations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 4. billing_customers — app user <-> Stripe customer
-- =====================================================================
CREATE TABLE public.billing_customers (
  user_id uuid PRIMARY KEY,
  stripe_customer_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_customers TO authenticated;
GRANT ALL ON public.billing_customers TO service_role;

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own billing customer"
  ON public.billing_customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 5. purchases — one row per Checkout Session
-- =====================================================================
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  stripe_price_id text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  amount_total_cents integer,
  currency text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','expired','refunded','disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchases_user_created_idx ON public.purchases (user_id, created_at DESC);
CREATE INDEX purchases_pending_idx ON public.purchases (created_at) WHERE status = 'pending';

GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own purchases"
  ON public.purchases FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 6. stripe_events — webhook inbox (service-role only)
-- =====================================================================
-- PK is the Stripe event id: duplicate delivery is a no-op insert.
CREATE TABLE public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','skipped','error')),
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX stripe_events_status_idx ON public.stripe_events (status, received_at);

GRANT ALL ON public.stripe_events TO service_role;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies: not visible to any client role.

-- =====================================================================
-- 7. credit_products — purchasable packs (UI + checkout validation)
-- =====================================================================
-- Checkout validates the client-sent price id against this table; the
-- client never submits a price or amount. Stripe remains the source of
-- truth for money; this is the app-side mirror.
CREATE TABLE public.credit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id text,
  stripe_price_id text NOT NULL UNIQUE,
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  active boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_products TO authenticated;
GRANT ALL ON public.credit_products TO service_role;

ALTER TABLE public.credit_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read products"
  ON public.credit_products FOR SELECT TO authenticated USING (true);

-- Placeholder packs. The owner replaces stripe_price_id with real test/live
-- Price ids from the Stripe dashboard and flips active=true (see RUNBOOK).
INSERT INTO public.credit_products (stripe_price_id, name, credits, amount_cents, active, sort) VALUES
  ('price_REPLACE_STARTER', 'Starter',  5, 1000, false, 1),
  ('price_REPLACE_WRITER',  'Writer',  20, 3200, false, 2),
  ('price_REPLACE_STUDIO',  'Studio',  50, 7000, false, 3);

-- =====================================================================
-- 8. subscriptions — schema ready, not exposed in the UI yet
-- =====================================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_price_id text NOT NULL,
  status text NOT NULL,
  credits_per_period integer NOT NULL DEFAULT 0,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions (user_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- 9. agent_runs.parent_run_id — links a chained compose run to the
--    research run that carries the credit reservation.
-- =====================================================================
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL;

-- =====================================================================
-- 10. Money functions (SECURITY DEFINER; service_role/trigger only)
-- =====================================================================

-- Grant (positive) or reverse (negative) credits with an idempotency key.
-- Returns the new ledger entry id, or NULL when the key was already used.
-- Negative entries clamp the projection at 0 (refund after spend); the
-- full amount is still recorded in the ledger for traceability.
CREATE OR REPLACE FUNCTION public.grant_credits(
  _user_id uuid,
  _amount integer,
  _entry_type text,
  _idempotency_key text,
  _stripe_event_id text DEFAULT NULL,
  _purchase_id uuid DEFAULT NULL,
  _run_id uuid DEFAULT NULL,
  _actor text DEFAULT 'system',
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entry_id uuid;
BEGIN
  IF _amount = 0 THEN
    RAISE EXCEPTION 'grant_credits: amount must be non-zero';
  END IF;

  INSERT INTO public.credit_accounts (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_ledger
    (user_id, amount, entry_type, idempotency_key, stripe_event_id,
     purchase_id, run_id, actor, reason, metadata)
  VALUES
    (_user_id, _amount, _entry_type, _idempotency_key, _stripe_event_id,
     _purchase_id, _run_id, _actor, _reason, COALESCE(_metadata, '{}'::jsonb))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _entry_id;

  IF _entry_id IS NULL THEN
    RETURN NULL; -- idempotent replay
  END IF;

  UPDATE public.credit_accounts
     SET balance = GREATEST(0, balance + _amount),
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN _entry_id;
END;
$$;

-- Atomically hold credits for a run. Raises 'insufficient_credits' when the
-- balance cannot cover the hold. Idempotent on run_id: a retry for the same
-- run returns the existing reservation without double-holding.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  _user_id uuid,
  _run_id uuid,
  _amount integer,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance integer;
  _existing uuid;
  _res_id uuid;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'reserve_credits: amount must be positive';
  END IF;

  INSERT INTO public.credit_accounts (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Row lock serializes concurrent spends (double-click, second tab).
  SELECT balance INTO _balance
  FROM public.credit_accounts
  WHERE user_id = _user_id
  FOR UPDATE;

  SELECT id INTO _existing
  FROM public.credit_reservations
  WHERE run_id = _run_id;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  IF _balance < _amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_reservations (user_id, run_id, amount, reason)
  VALUES (_user_id, _run_id, _amount, _reason)
  RETURNING id INTO _res_id;

  UPDATE public.credit_accounts
     SET balance = balance - _amount,
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN _res_id;
END;
$$;

-- Consume a held reservation after the run's success condition. Writes the
-- immutable consumption entry; the balance was already decremented at hold.
-- Returns false when there was nothing to settle (no hold, or already
-- resolved) — safe to call from webhook and reconciler concurrently.
CREATE OR REPLACE FUNCTION public.settle_reservation(_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res public.credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO _res
  FROM public.credit_reservations
  WHERE run_id = _run_id
  FOR UPDATE;

  IF _res.id IS NULL OR _res.status <> 'held' THEN
    RETURN false;
  END IF;

  UPDATE public.credit_reservations
     SET status = 'settled', resolved_at = now()
   WHERE id = _res.id;

  INSERT INTO public.credit_ledger
    (user_id, amount, entry_type, idempotency_key, run_id, reservation_id, actor)
  VALUES
    (_res.user_id, -_res.amount, 'consumption', 'settle:' || _run_id, _run_id, _res.id, 'system')
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN true;
END;
$$;

-- Return a held reservation to the balance after a qualifying failure
-- (failed dispatch, failed/cancelled run, stuck-run timeout). Same
-- concurrency contract as settle_reservation.
CREATE OR REPLACE FUNCTION public.release_reservation(_run_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res public.credit_reservations%ROWTYPE;
BEGIN
  -- Lock the account first (same order as reserve_credits) to avoid deadlock.
  PERFORM 1 FROM public.credit_accounts
  WHERE user_id = (SELECT user_id FROM public.credit_reservations WHERE run_id = _run_id)
  FOR UPDATE;

  SELECT * INTO _res
  FROM public.credit_reservations
  WHERE run_id = _run_id
  FOR UPDATE;

  IF _res.id IS NULL OR _res.status <> 'held' THEN
    RETURN false;
  END IF;

  UPDATE public.credit_reservations
     SET status = 'released',
         resolved_at = now(),
         reason = COALESCE(_reason, reason)
   WHERE id = _res.id;

  UPDATE public.credit_accounts
     SET balance = balance + _res.amount,
         updated_at = now()
   WHERE user_id = _res.user_id;

  RETURN true;
END;
$$;

-- Administrative adjustment: always a ledger entry with an actor and a
-- reason, never a silent balance overwrite.
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  _user_id uuid,
  _amount integer,
  _reason text,
  _actor text,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'admin_adjust_credits: reason is required';
  END IF;
  IF _actor IS NULL OR btrim(_actor) = '' THEN
    RAISE EXCEPTION 'admin_adjust_credits: actor is required';
  END IF;
  RETURN public.grant_credits(
    _user_id, _amount, 'admin_adjustment', _idempotency_key,
    NULL, NULL, NULL, _actor, _reason, '{}'::jsonb
  );
END;
$$;

-- =====================================================================
-- 11. Signup grant — trigger on auth.users
-- =====================================================================
-- Idempotent by construction: the ledger key is derived from the user id,
-- so refreshes, replays, and profile edits can never re-grant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_credits(
    NEW.id, 3, 'signup_grant', 'signup:' || NEW.id,
    NULL, NULL, NULL, 'system', 'Complimentary signup credits'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block signup on a grant failure; the miss is recoverable via
  -- admin_adjust_credits and visible in the reconciliation query.
  RAISE WARNING 'handle_new_user grant failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 12. Lock down function execution
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_reservation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 13. Backfill: signup grant for every existing user
-- =====================================================================
DO $$
DECLARE _uid uuid;
BEGIN
  FOR _uid IN SELECT id FROM auth.users LOOP
    PERFORM public.grant_credits(
      _uid, 3, 'signup_grant', 'signup:' || _uid,
      NULL, NULL, NULL, 'system', 'Complimentary signup credits (backfill)'
    );
  END LOOP;
END $$;
