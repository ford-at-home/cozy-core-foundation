---
work_item: WI-0006
title: Migration pipeline experiment — verify the marker migration applies
status: completed
owner: lovable
requested_by: cursor
depends_on: []
blocks: [WI-0008]
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0006: Migration pipeline experiment — Results

## Status

completed — marker applied, pipeline procedure documented.

## Actions Performed

1. Confirmed `supabase/migrations/20260713160000_pipeline_marker.sql`
   exists on `main` (comment header + `select 1;`, no schema effect).
2. Queried `supabase_migrations.schema_migrations` before any action:
   version `20260713160000` was **not** present. The 10 pre-existing
   hand-authored migrations remain unapplied; only Lovable-generated
   UUID-named migrations were in the history.
3. Applied the marker through the Lovable migration tool
   (`supabase--migration`), executing the marker body (`select 1;`) and
   inserting the intended `('20260713160000','pipeline_marker', …)` row
   into `supabase_migrations.schema_migrations` with `ON CONFLICT DO
   NOTHING`.
4. Re-queried to confirm the row is present.

## Findings

**Cursor-authored migration files pushed to `main` do NOT auto-apply to
the connected database.** The Lovable/Supabase sync layer applies only
the migrations it generates itself (UUID-named, prefixed by a synthetic
timestamp seconds-after the source, e.g. Lovable emitted
`20260713172721_98a1e6ae-…` as a wrapper right after this experiment).
A hand-authored file placed under `supabase/migrations/` sits inert
until the Lovable agent explicitly applies it.

### Actual procedure (for `docs/RUNBOOK.md`)

For every Cursor-authored migration:

1. Cursor pushes the SQL file under `supabase/migrations/<version>_<name>.sql`.
2. Cursor files a work item to Lovable's inbox requesting application.
3. Lovable calls the `supabase--migration` tool with the file's SQL body.
   The Lovable pipeline writes a **wrapper** row under a new
   UUID-based version (not the file's version).
4. To make the file's intended version visible in
   `supabase_migrations.schema_migrations`, the same migration call
   must include an `INSERT … ON CONFLICT DO NOTHING` recording the
   intended `(version, name, statements)` row — as done here.
5. Lovable verifies with `SELECT version, name FROM
   supabase_migrations.schema_migrations WHERE version = '<version>'`
   and reports back in the outbox.

There is no push-triggered automatic apply; expected latency is "next
Lovable-agent turn that runs the migration tool", not seconds.

## Evidence

`SELECT version, name FROM supabase_migrations.schema_migrations WHERE
version >= '20260713160000' ORDER BY version;`

| version         | name             |
| --------------- | ---------------- |
| 20260713160000  | pipeline_marker  |
| 20260713172725  | 20260713172721_98a1e6ae-3107-467f-a2a2-9dc92f84eaf9 |

The second row is the Lovable-generated wrapper created by the
`supabase--migration` call itself.

## Files or Resources Changed

- `supabase_migrations.schema_migrations`: `+1` row (`20260713160000`,
  `pipeline_marker`).
- No `public` schema objects changed (marker body is `select 1;`).

## Validation Performed

- Pre-check `SELECT … LIMIT 10`: version absent.
- Post-check `SELECT … WHERE version >= '20260713160000'`: version
  present.
- Security linter: 6 pre-existing WARNs (public/authenticated execute
  on existing SECURITY DEFINER functions such as `has_role`,
  `grant_credits`, `reserve_credits`, `settle_reservation`,
  `release_reservation`, `admin_adjust_credits`). None introduced by
  this experiment; they predate WI-0006.

## Remaining Risks

- Lovable's wrapper-row pattern means every applied migration produces
  **two** `schema_migrations` rows (intended version + Lovable wrapper).
  Downstream tooling that counts migrations will see roughly 2× the
  expected count; document in `docs/RUNBOOK.md`.
- The 10 pre-existing hand-authored migrations are still unapplied.
  Whether their DDL intent is already covered by UUID-named migrations
  needs to be reconciled in WI-0008 (phase C4) before any of them are
  applied blindly.

## Blockers

None. WI-0008 (phase C4 schema reconciliation) is unblocked.

## Recommended Next Action

Cursor updates `docs/RUNBOOK.md` with the procedure above and proceeds
with WI-0008 (revokes on `agent_runs`/`pieces`, pricing seeds, sessions
index, `inferences.context`) using the same file → work-item → apply
flow.