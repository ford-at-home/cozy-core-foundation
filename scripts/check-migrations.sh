#!/usr/bin/env bash
# Migration safety check.
#
#   1. Every table created in the public schema across supabase/migrations/
#      must have RLS enabled and at least one CREATE POLICY somewhere in the
#      migrations directory.
#   2. RLS must never be disabled ("disable row level security").
#
# DROP POLICY is allowed only because this repo's convention is
# drop-then-recreate (idempotent replays); the per-table policy requirement
# above is what catches a policy that was dropped and never recreated.
set -euo pipefail
cd "$(dirname "$0")/.."

MIG_DIR="supabase/migrations"
fail=0

if [ ! -d "$MIG_DIR" ]; then
  echo "check-migrations: no migrations directory; nothing to check."
  exit 0
fi

# Flatten to one line per statement-ish chunk: SQL statements span lines
# (e.g. CREATE POLICY "name"\n ON table), so normalize newlines to spaces.
all_sql=$(cat "$MIG_DIR"/*.sql | tr '[:upper:]' '[:lower:]' | tr '\n' ' ')

# Tables created in public schema (handles: create table [if not exists] [public.]name)
tables=$(printf '%s' "$all_sql" \
  | grep -oE 'create table (if not exists )?(public\.)?[a-z_]+' \
  | sed -E 's/create table (if not exists )?(public\.)?//' \
  | sort -u)

echo "== tables created in migrations =="
echo "$tables"

for t in $tables; do
  # A table may have been renamed; if so, check the new name too.
  names="$t"
  renamed=$(printf '%s' "$all_sql" \
    | grep -oE "alter table (if exists )?(public\.)?$t rename to [a-z_]+" \
    | sed -E 's/.* rename to //' | sort -u || true)
  [ -n "$renamed" ] && names="$t $renamed"

  has_rls=0
  has_policy=0
  for n in $names; do
    if printf '%s' "$all_sql" | grep -qE "alter table (if exists )?(public\.)?$n enable row level security"; then
      has_rls=1
    fi
    if printf '%s' "$all_sql" | grep -qE "create policy [^;]* on (public\.)?$n"; then
      has_policy=1
    fi
  done

  # RLS-on with zero policies is the strictest posture (deny-all to client
  # roles; service role bypasses RLS). It's legitimate for server-only tables
  # like the stripe_events webhook inbox, but it must be declared: a
  # "-- no policies" comment directly after the ENABLE ROW LEVEL SECURITY
  # statement.
  declared_no_policy=0
  for n in $names; do
    if printf '%s' "$all_sql" | grep -qE "alter table (public\.)?$n enable row level security; *-- no policies"; then
      declared_no_policy=1
    fi
  done

  if [ "$has_rls" -eq 0 ]; then
    echo "FAIL: table '$t' is created but RLS is never enabled on it (or its rename)."
    fail=1
  fi
  if [ "$has_policy" -eq 0 ] && [ "$declared_no_policy" -eq 0 ]; then
    echo "FAIL: table '$t' has no CREATE POLICY anywhere in migrations (add policies, or mark intentional deny-all with a '-- no policies' comment right after ENABLE ROW LEVEL SECURITY)."
    fail=1
  fi
done

if printf '%s' "$all_sql" | grep -qE 'disable row level security'; then
  echo "FAIL: a migration disables row level security."
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "check-migrations: FAILED"
  exit 1
fi
echo "check-migrations: OK"
