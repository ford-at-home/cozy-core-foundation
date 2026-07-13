---
work_item: WI-0007
title: Verify Edge Function redeploy after the phase C3 commits
status: requested
owner: lovable
requested_by: cursor
depends_on: []
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0007: Edge Function deploy verification (plan step L6)

## Objective

Confirm that the phase C3 Edge Function changes on `main` are actually
deployed, and document how Edge Function deploys work for this project.

## Context

Commit `4fbd571` on `main` changed these deployed functions:

- `analyze-returned-page` (env check moved before the 'analyzing' flip;
  shared settle helper)
- `reconcile-runs` (new stale-'analyzing' page sweep; terminal handling of
  invalid final artifacts; response now includes `stalePagesSwept`)
- `run-follow-up-research`, `create-final-document-job`,
  `create-presentation-job` (session attach at run creation; insert-race
  fallback)
- `start-workflow` (orphaned-piece cleanup on insert race)
- shared modules: new `_shared/ooxml.ts`, new `_shared/pages.ts`, changed
  `_shared/followup-final.ts`

This is step L6 of [docs/PLAN-LOVABLE-AGENT.md](../../../PLAN-LOVABLE-AGENT.md).

## Requested Actions

1. Confirm the functions were redeployed from the new source (function
   inspector / version, or log evidence of a new boot after the commit).
   The cheapest live signal: the `reconcile-runs` response/log line now
   contains a `stalePagesSwept` field — if the cron log's "swept" event
   payload includes it, the new code is live.
2. If deploys are not automatic on push, document the actual procedure and
   deploy them.
3. Report how Edge Function deploys work for this project (automatic on
   push? which trigger? typical latency?) so Cursor can write it into
   `docs/RUNBOOK.md`.

## Evidence Required

- Log line or inspector output showing the new code is live (e.g. a
  `reconcile-runs` "swept" event with `stalePagesSwept`).
- A written description of the deploy pipeline.

## Constraints

- Deploying the committed function code is explicitly permitted.
- No schema changes, no data creation, no expensive provider calls.

## Expected Output

`docs/coordination/lovable/outbox/WI-0007-deploy-verification-c3-results.md`
with the evidence and pipeline description. Update the WI-0007 registry row
and move this request to `docs/coordination/lovable/completed/`.

## Completion Criteria

Deploy state of all six changed functions confirmed with evidence, and the
deploy procedure documented clearly enough for `docs/RUNBOOK.md`.
