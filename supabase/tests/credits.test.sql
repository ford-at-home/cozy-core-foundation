-- Invariant tests for the credit money functions. Run against a database
-- with the migrations applied (local `supabase db reset` stack or a staging
-- project — NEVER production):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/credits.test.sql
--
-- Everything runs in one transaction and rolls back: the database is left
-- untouched. Every assertion raises on failure, so a clean exit (and the
-- final NOTICE) means all invariants hold. For the concurrent-spend race,
-- see supabase/tests/credit-concurrency.sh (needs two connections).

BEGIN;

DO $$
DECLARE
  _uid uuid := gen_random_uuid();
  _run1 uuid;
  _run2 uuid;
  _balance integer;
  _ledger_count integer;
  _entry uuid;
BEGIN
  -- ------------------------------------------------------------------
  -- Signup grant fires once per user and is idempotent by construction.
  -- ------------------------------------------------------------------
  INSERT INTO auth.users (id, email) VALUES (_uid, _uid || '@test.local');

  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'signup grant: expected balance 3, got %', _balance;
  END IF;

  -- Replaying the grant (same idempotency key) must change nothing.
  PERFORM public.grant_credits(_uid, 3, 'signup_grant', 'signup:' || _uid);
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'signup grant replay: expected balance 3, got %', _balance;
  END IF;
  SELECT count(*) INTO _ledger_count FROM public.credit_ledger
   WHERE user_id = _uid AND entry_type = 'signup_grant';
  IF _ledger_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'signup grant replay: expected 1 ledger row, got %', _ledger_count;
  END IF;

  -- ------------------------------------------------------------------
  -- Reserve decrements the balance and is idempotent on run_id.
  -- ------------------------------------------------------------------
  INSERT INTO public.agent_runs (user_id, kind, status)
  VALUES (_uid, 'proposal', 'dispatching') RETURNING id INTO _run1;

  PERFORM public.reserve_credits(_uid, _run1, 2, 'test hold');
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'reserve: expected balance 1, got %', _balance;
  END IF;

  PERFORM public.reserve_credits(_uid, _run1, 2, 'retried hold'); -- same run
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'reserve replay: expected balance 1, got %', _balance;
  END IF;

  -- ------------------------------------------------------------------
  -- Insufficient credits raises and leaves no state behind.
  -- ------------------------------------------------------------------
  INSERT INTO public.agent_runs (user_id, kind, status)
  VALUES (_uid, 'proposal', 'dispatching') RETURNING id INTO _run2;
  BEGIN
    PERFORM public.reserve_credits(_uid, _run2, 2, 'over budget');
    RAISE EXCEPTION 'insufficient: reserve should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%insufficient_credits%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.credit_reservations WHERE run_id = _run2) THEN
    RAISE EXCEPTION 'insufficient: reservation row should not exist';
  END IF;

  -- ------------------------------------------------------------------
  -- Settle consumes exactly once; the balance stays decremented.
  -- ------------------------------------------------------------------
  IF NOT public.settle_reservation(_run1) THEN
    RAISE EXCEPTION 'settle: first settle should return true';
  END IF;
  IF public.settle_reservation(_run1) THEN
    RAISE EXCEPTION 'settle: second settle should be a no-op';
  END IF;
  SELECT count(*) INTO _ledger_count FROM public.credit_ledger
   WHERE user_id = _uid AND entry_type = 'consumption';
  IF _ledger_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'settle: expected 1 consumption entry, got %', _ledger_count;
  END IF;
  -- Release after settle must also be a no-op.
  IF public.release_reservation(_run1, 'too late') THEN
    RAISE EXCEPTION 'release after settle should be a no-op';
  END IF;
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'after settle: expected balance 1, got %', _balance;
  END IF;

  -- ------------------------------------------------------------------
  -- Release returns the hold to the balance.
  -- ------------------------------------------------------------------
  PERFORM public.reserve_credits(_uid, _run2, 1, 'second hold');
  IF NOT public.release_reservation(_run2, 'run failed') THEN
    RAISE EXCEPTION 'release: first release should return true';
  END IF;
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'after release: expected balance 1, got %', _balance;
  END IF;

  -- ------------------------------------------------------------------
  -- Purchase grant idempotency (same key as the webhook would use).
  -- ------------------------------------------------------------------
  PERFORM public.grant_credits(_uid, 20, 'purchase', 'purchase:cs_test_1');
  PERFORM public.grant_credits(_uid, 20, 'purchase', 'purchase:cs_test_1'); -- duplicate delivery
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 21 THEN
    RAISE EXCEPTION 'purchase idempotency: expected balance 21, got %', _balance;
  END IF;

  -- ------------------------------------------------------------------
  -- Refund reversal floors the projection at 0; the ledger keeps the
  -- full negative amount.
  -- ------------------------------------------------------------------
  PERFORM public.grant_credits(_uid, -100, 'refund_reversal', 'refund:ch_test_1');
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'refund floor: expected balance 0, got %', _balance;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = _uid AND entry_type = 'refund_reversal' AND amount = -100
  ) THEN
    RAISE EXCEPTION 'refund floor: full reversal must be in the ledger';
  END IF;

  -- ------------------------------------------------------------------
  -- Admin adjustments require a reason and an actor.
  -- ------------------------------------------------------------------
  BEGIN
    PERFORM public.admin_adjust_credits(_uid, 5, '', 'admin:test', 'adm:1');
    RAISE EXCEPTION 'admin adjust: empty reason should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reason is required%' THEN RAISE; END IF;
  END;
  SELECT public.admin_adjust_credits(_uid, 5, 'support goodwill', 'admin:test@example.com', 'adm:2')
    INTO _entry;
  IF _entry IS NULL THEN
    RAISE EXCEPTION 'admin adjust: expected a ledger entry id';
  END IF;
  SELECT balance INTO _balance FROM public.credit_accounts WHERE user_id = _uid;
  IF _balance IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'admin adjust: expected balance 5, got %', _balance;
  END IF;

  RAISE NOTICE 'credits.test.sql: all invariants hold';
END $$;

ROLLBACK;
