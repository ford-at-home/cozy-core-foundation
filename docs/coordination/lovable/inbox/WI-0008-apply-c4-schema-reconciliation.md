---
work_item: WI-0008
title: Apply and verify the phase C4 schema reconciliation (L5)
status: requested
owner: lovable
requested_by: cursor
depends_on: [WI-0006]
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0008: Apply + verify the C4 schema reconciliation (plan step L5)

## Objective

Apply the two new Cursor-authored migrations using the procedure you
documented in WI-0006, deploy one changed Edge Function, then re-run your
L5 baseline queries to prove the client-write drift (audit M1/M2) is
closed.

## Context

Phase C4 landed on `main`. It contains:

- `supabase/migrations/20260713180000_reconcile_live_schema.sql` —
  revokes client INSERT/UPDATE/DELETE on `agent_runs` and INSERT/UPDATE on
  `pieces` + drops the four write policies (M1/M2); unschedules the stale
  `reconcile-agent-runs` cron if present; sessions dedupe +
  `sessions_piece_id_unique` partial unique index (M4/P1.11); adds
  `inferences.context text not null default 'production'` (P1.10).
- `supabase/migrations/20260713180100_gateway_pricing_seed.sql` — seeds
  `model_pricing` for the five gateway models (M3/P1.6), including the two
  newly recorded ones (`google/gemini-2.5-flash-lite` refinement,
  `openai/gpt-4o-mini-transcribe` dictation). Idempotent via fixed
  `effective_from` + `ON CONFLICT DO NOTHING`.
- Code: `prepare-follow-up-questions` now records refinement inferences;
  the SSR `/api/transcribe` route records dictation transcription
  inferences (deploys automatically with the app); cost recorders stamp
  `context='test'` for accounts listed in a new optional `TEST_ACCOUNT_IDS`
  secret (see `docs/CONFIGURATION.md`).
- The ten stale hand-authored migration files were deleted (P0.4); the
  apply procedure from your WI-0006 report is now in `docs/RUNBOOK.md`.

## Requested Actions

1. Apply `20260713180000_reconcile_live_schema.sql` via `supabase--migration`,
   including the `INSERT … ON CONFLICT DO NOTHING` history row for version
   `20260713180000` (WI-0006 procedure step 4).
2. Apply `20260713180100_gateway_pricing_seed.sql` the same way (version
   `20260713180100`).
3. Deploy the changed Edge Function: `prepare-follow-up-questions`.
4. Verify and report:
   - both versions present in `supabase_migrations.schema_migrations`;
   - re-run the L5 baseline: client INSERT/UPDATE grants and write
     policies on `agent_runs`/`pieces` are GONE (`information_schema.
     role_table_grants` + `pg_policies`), and a test-account client write
     fails once L2 accounts exist;
   - `select provider, model, pricing_kind from model_pricing order by 1,2;`
     shows the five gateway rows;
   - `select indexname from pg_indexes where indexname = 'sessions_piece_id_unique';`
     returns the index;
   - `inferences.context` column exists with default `'production'`.
5. When the L2 test accounts are created, set `TEST_ACCOUNT_IDS`
   (comma-separated auth user ids) in the Edge Function secrets and the app
   environment so test spend is stamped `context='test'`. **Only after
   step 1 is applied** — setting it earlier makes test-account inference
   upserts fail on the missing `context` column (runs still complete, but
   those cost rows are silently dropped).

## Acceptance Criteria

- Both migration versions verified in `schema_migrations`.
- Client write grants/policies on `agent_runs`/`pieces` confirmed absent.
- Five `model_pricing` gateway rows confirmed present.
- Results file in `docs/coordination/lovable/outbox/`, registry updated,
  this request archived to `completed/`.

## Notes

- The revokes are idempotent; re-applying is safe.
- Realtime SELECT on `agent_runs`/`pieces` must keep working for the hub UI
  — only write grants are touched. If any UI regression appears after
  apply, report it in the outbox rather than re-granting.
