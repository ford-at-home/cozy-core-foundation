---
work_item: WI-0010
title: Cost calibration revive Step 1 (repo) — migration + dispatch + handoff
status: ready_for_review
owner: cursor
requested_by: human
depends_on: []
blocks: [WI-0011]
created: 2026-07-14
updated: 2026-07-14
priority: P1
---

# WI-0010 Cursor results — Step 1 repo work (PR #4 revive)

## Summary

PR #4 was still open and conflicting; its unique unfinished work had not
landed on `main`. Step 1 ports only the Lovable-facing / schema / dispatch
half so the UI half (WI-0011) can wait for a live column + regenerated types.

## What changed (repository)

| Area | Change |
|------|--------|
| Migration | `supabase/migrations/20260714080000_cost_proxies_and_targets.sql` — `workflow_cost_targets`, `agent_runs.cost_proxies`, `recompute_run_cost_proxies`, trigger hooks |
| Dispatch | `researchChars` optional on `dispatchRun`; written into `agent_runs.input.research_chars` |
| Call sites | `start-workflow`, `piece-action` (resynth), `_shared/research.ts` (chained compose) |
| Docs | `docs/COST-CALIBRATION.md`, RUNBOOK + ARCHITECTURE pointers |
| Coordination | Lovable inbox WI-0010; Cursor WI-0011 plan (draft/blocked) |

## Explicitly NOT in this step

- `SessionCostBanner`, dashboard cost column, RunCostCard proxy UI,
  `getSessionBudget` — those are WI-0011 after types exist.
- Old PR migration filenames `20260712110000_*` / `20260712113000_*` — not
  re-introduced; gateway seeds already live as C4
  `20260713180100_gateway_pricing_seed.sql`.

## Handoff pending

Lovable: [WI-0010 request](../../lovable/inbox/WI-0010-apply-cost-proxies-and-targets.md)

## Verification (repo-side)

Commands run are recorded in the PR / agent final report (`check-migrations`,
`check-secrets`, `test:functions`, lint/typecheck/test/build as applicable).
Live apply/deploy verification is Lovable's acceptance criteria for WI-0010.
