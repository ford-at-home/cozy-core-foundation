---
work_item: WI-0009
title: Apply and verify the phase C8 duration migration (duration_ms fix + stats view)
status: requested
owner: lovable
requested_by: cursor
depends_on: [WI-0008]
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0009: Apply + verify the C8 duration fix

## Objective

Apply the phase C8 migration so `duration_ms` is stamped on run completion
(fixing the P0 defect your L7 sweep re-confirmed), backfill the existing
zero rows, and expose the `run_duration_stats` view the UI now reads.

## Context

Your WI-0005/L7 results showed `duration_ms = 0` for every terminal kind
except `revision`, with `dispatched_at`/`completed_at` both populated. Root
cause matches your diagnosis: `recompute_run_totals` only fires from
`inferences` changes, and completion paths record inferences *before*
setting `completed_at`, so the timestamp branch never sees both values.

`supabase/migrations/20260713184000_run_duration_stats.sql` (on `main`):

1. New BEFORE trigger `agent_runs_set_duration` — stamps `duration_ms`
   whenever `completed_at` lands (any path: webhook, reconciler, edge
   function).
2. Backfill of existing terminal rows where `duration_ms` is 0/NULL
   (idempotent).
3. `run_duration_stats` view — median/p75 per completed kind, published
   only at ≥ 10 samples; SELECT granted to `authenticated`. Aggregates
   only (kind + milliseconds), no per-user data. The hub/new-page UI
   renders "usually X–Y minutes, based on recent runs" from it and stays
   non-numeric until a kind crosses the gate.

No Edge Function changes in this phase — nothing to deploy beyond the app
build (automatic).

## Requested Actions

1. Apply the migration per the WI-0006 procedure (include the
   `ON CONFLICT DO NOTHING` history row for version `20260713184000`).
2. Verify and report:
   - `select kind, count(*), min(duration_ms), max(duration_ms) from
     agent_runs where status = 'completed' group by kind;` — the L7 runs
     now show their real wall times (research ~369000, proposal
     ~899000–1006000, packet ~401000 ms) instead of 0;
   - `select * from run_duration_stats;` — expected EMPTY today (no kind
     has 10 samples yet); confirm the view exists and is selectable as an
     authenticated test account;
   - session rollups: `sessions.total_duration_ms` for the L7 pieces is
     non-zero after the backfill (the backfill UPDATE re-fires the session
     rollup trigger).

3. Regenerate `src/integrations/supabase/types.ts` if your tooling supports
   including views — the client currently reads `run_duration_stats`
   through an untyped cast (`src/lib/run-duration.ts`) that can be removed
   once the view is in the generated types. Optional, not blocking.

## Acceptance Criteria

- Version `20260713184000` in `schema_migrations`.
- Backfilled durations match the L7 wall times within rounding.
- View selectable by `authenticated`; empty result today is correct.
- Results file in the outbox, registry updated, request archived.
