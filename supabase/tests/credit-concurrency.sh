#!/usr/bin/env bash
# Concurrent-spend race test for reserve_credits: two sessions try to spend
# the last credit at the same moment. Exactly one must win; the other must
# get insufficient_credits. Needs two real connections, so this cannot live
# inside a single-transaction SQL file.
#
# Run against a local `supabase db reset` stack or staging — NEVER production:
#
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     supabase/tests/credit-concurrency.sh
#
# The script creates a throwaway user with a 1-credit balance and cleans up
# after itself.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a local/staging database}"

UID_TEST=$(uuidgen | tr 'A-Z' 'a-z')
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
INSERT INTO auth.users (id, email) VALUES ('$UID_TEST', '$UID_TEST@race.local');
-- Signup trigger granted 3; burn down to exactly 1 so the race is for the last credit.
SELECT public.grant_credits('$UID_TEST', -2, 'admin_adjustment', 'race-setup:$UID_TEST',
                             NULL, NULL, NULL, 'admin:test', 'race test setup');
SQL

RUN_A=$(psql "$DATABASE_URL" -tAq -c \
  "INSERT INTO public.agent_runs (user_id, kind, status) VALUES ('$UID_TEST','proposal','dispatching') RETURNING id")
RUN_B=$(psql "$DATABASE_URL" -tAq -c \
  "INSERT INTO public.agent_runs (user_id, kind, status) VALUES ('$UID_TEST','proposal','dispatching') RETURNING id")

# Session A opens a transaction, takes the hold (locking the account row),
# and keeps the transaction open while session B races it.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL &
BEGIN;
SELECT public.reserve_credits('$UID_TEST', '$RUN_A', 1, 'race A');
SELECT pg_sleep(3);
COMMIT;
SQL
A_PID=$!

sleep 1 # let A grab the row lock first

# Session B blocks on A's row lock, then must see balance 0 and raise.
set +e
B_OUT=$(psql "$DATABASE_URL" -q -c \
  "SELECT public.reserve_credits('$UID_TEST', '$RUN_B', 1, 'race B')" 2>&1)
B_STATUS=$?
set -e
wait "$A_PID"

HELD=$(psql "$DATABASE_URL" -tAq -c \
  "SELECT count(*) FROM public.credit_reservations WHERE user_id = '$UID_TEST' AND status = 'held'")
BALANCE=$(psql "$DATABASE_URL" -tAq -c \
  "SELECT balance FROM public.credit_accounts WHERE user_id = '$UID_TEST'")

# Cleanup before asserting so failures don't leave junk behind.
psql "$DATABASE_URL" -q <<SQL
DELETE FROM public.credit_reservations WHERE user_id = '$UID_TEST';
DELETE FROM public.credit_ledger WHERE user_id = '$UID_TEST';
DELETE FROM public.agent_runs WHERE user_id = '$UID_TEST';
DELETE FROM auth.users WHERE id = '$UID_TEST';
SQL

if [ "$B_STATUS" -eq 0 ]; then
  echo "FAIL: session B's reserve should have raised insufficient_credits" >&2
  exit 1
fi
if ! echo "$B_OUT" | grep -q insufficient_credits; then
  echo "FAIL: session B failed for the wrong reason: $B_OUT" >&2
  exit 1
fi
if [ "$HELD" != "1" ] || [ "$BALANCE" != "0" ]; then
  echo "FAIL: expected exactly 1 held reservation and balance 0; got held=$HELD balance=$BALANCE" >&2
  exit 1
fi

echo "credit-concurrency.sh: one winner, one insufficient_credits — race is safe"
