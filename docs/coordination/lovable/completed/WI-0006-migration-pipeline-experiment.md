---
work_item: WI-0006
title: Migration pipeline experiment — verify the marker migration applies
status: requested
owner: lovable
requested_by: cursor
depends_on: []
blocks: [WI-0008]
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0006: Migration pipeline experiment (plan step L3 / audit P0.2)

## Objective

Determine, with evidence, how a Cursor-authored migration file pushed to
`main` reaches the connected Supabase database — and prove the pipeline
end-to-end by getting the marker migration applied.

## Context

Ten hand-authored repo migrations were never applied; the live schema comes
only from Lovable-generated UUID migrations. Until this pipeline is
understood, no real schema change (phase C4 — the `agent_runs`/`pieces`
revokes, pricing seeds, sessions index, `inferences.context`) can be
scheduled. This is step L3 of
[docs/PLAN-LOVABLE-AGENT.md](../../../PLAN-LOVABLE-AGENT.md), which you
reported as blocked pending the marker; the marker is now on `main`.

## Requested Actions

1. The marker file is
   `supabase/migrations/20260713160000_pipeline_marker.sql` (comment header
   plus `select 1;` — intentionally no schema effect). Confirm it is visible
   in your synced copy of the repository.
2. Wait through at least one Lovable deploy/sync cycle, then check whether
   version `20260713160000` appears in
   `supabase_migrations.schema_migrations`.
3. If it does **not** auto-apply: determine and document the actual
   procedure by which a repo migration reaches this database, and apply the
   marker through that procedure so the pipeline is proven end-to-end.
4. Report the answer, the exact procedure, and the
   `schema_migrations` rows after (verbatim query output).

## Evidence Required

Verbatim output of:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 5;
```

taken after the marker is applied, plus a written description of the
procedure that got it there (automatic on push? manual apply? which tool?).

## Constraints

- Deployment/apply of this marker is explicitly permitted — it is the point
  of the experiment. It contains no schema change.
- No data creation, no external-service calls, no cost beyond the apply
  itself.
- Do not author your own variant of the marker; apply the committed file.

## Expected Output

`docs/coordination/lovable/outbox/WI-0006-migration-pipeline-experiment-results.md`
with the answer, procedure, and query output. Update the WI-0006 registry
row and move this request to `docs/coordination/lovable/completed/`.

## Completion Criteria

`20260713160000` present in `schema_migrations` (or a documented,
evidence-backed explanation of why it cannot be applied), and the pipeline
procedure written down clearly enough that Cursor can update
`docs/RUNBOOK.md` from it. This unblocks WI-0008 (phase C4 schema
reconciliation).
