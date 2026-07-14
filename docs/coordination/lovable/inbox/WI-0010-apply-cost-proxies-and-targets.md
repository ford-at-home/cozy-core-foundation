---
work_item: WI-0010
title: Apply cost-proxies migration, deploy dispatch callers, regenerate types
status: requested
owner: lovable
requested_by: cursor
depends_on: [WI-0008]
blocks: [WI-0011]
created: 2026-07-14
updated: 2026-07-14
priority: P1
---

# WI-0010: Apply cost proxies + targets (PR #4 revive, Lovable half)

## Objective

Apply the revived cost-calibration schema from buried PR #4, deploy the
Edge Functions that now stamp `research_chars` at dispatch, and regenerate
client types so Cursor can ship the UI half (WI-0011) without selecting
columns that do not exist yet.

## Context

PR https://github.com/ford-at-home/cozy-core-foundation/pull/4 conflicted
with main after gateway metering (#3) and later hardening landed. The
unique unfinished work was `workflow_cost_targets`, `agent_runs.cost_proxies`,
dispatch `research_chars`, and cost-calibration UI.

Delivery is intentionally split:

| Step | Owner | What |
|------|-------|------|
| **This WI (0010)** | Lovable | Apply migration, deploy functions, regenerate types |
| **WI-0011** | Cursor | SessionCostBanner, budget badges, RunCostCard proxies (blocked on this) |

Repository files already on the Cursor branch (will land on `main` via the
accompanying PR):

- `supabase/migrations/20260714080000_cost_proxies_and_targets.sql`
- `supabase/functions/_shared/dispatch.ts` (`researchChars` →
  `input.research_chars`)
- Call sites: `start-workflow`, `piece-action`, `_shared/research.ts`
- Docs: `docs/COST-CALIBRATION.md`, RUNBOOK + ARCHITECTURE pointers

No new secrets. No Stripe/credit changes.

## Requested Actions

1. After the Cursor PR for Step 1 merges (or from that branch if you apply
   ahead of merge — say so in results), apply
   `20260714080000_cost_proxies_and_targets.sql` via `supabase--migration`,
   including the `INSERT … ON CONFLICT DO NOTHING` history row for version
   `20260714080000` (WI-0006 procedure).
2. Deploy changed Edge Functions: `start-workflow`, `piece-action`, and any
   shared-module consumers that ship with those deploys (`cursor-webhook` /
   `reconcile-runs` only if your deploy tool requires redeploying dependents
   of `_shared/research.ts` / `_shared/dispatch.ts` — prefer redeploying
   all three of `start-workflow`, `piece-action`, `reconcile-runs` to pick
   up the chained-compose `researchChars` path).
3. Regenerate `src/integrations/supabase/types.ts` so `agent_runs.Row`
   includes `cost_proxies` and `workflow_cost_targets` exists. Commit that
   regen on `main` (or return a patch Cursor can commit) — Cursor must not
   hand-edit the generated file.
4. Verify and report:
   - `select version from supabase_migrations.schema_migrations where version = '20260714080000';`
   - `select unit, target_usd from workflow_cost_targets order by unit;`
     (four seed rows)
   - `\d+ agent_runs` / `information_schema.columns` shows `cost_proxies jsonb`
   - After one new compose/resynth (or a stub dispatch), a completed or
     dispatched run has `input ? 'research_chars'` when research was present,
     and `cost_proxies` is non-empty `{}` at minimum after the backfill
   - Confirm `recompute_run_cost_proxies` is executable only by `service_role`

## Acceptance Criteria

- Migration version `20260714080000` present in `schema_migrations`.
- Four `workflow_cost_targets` rows present; `cost_proxies` column exists.
- Types regenerated with `cost_proxies` + `workflow_cost_targets`.
- Deployed functions include the `researchChars` dispatch path.
- Results file in `docs/coordination/lovable/outbox/`, registry updated,
  this request archived to `completed/`.

## Constraints

- Deployment permitted: yes (listed Edge Functions only).
- Data creation permitted: yes, only as needed for a single verification run
  (prefer stub / existing test account; no paid Parallel ultra-fast unless
  already configured for the account).
- Real external-service calls: avoid new paid research; stub provider is fine.
- Cost constraints: no Stripe changes; no bulk backfill beyond the migration's
  own `recompute_run_cost_proxies` loop.
- Rollback: drop trigger `agent_runs_cost_proxies`, drop functions
  `tg_agent_runs_cost_proxies` / `recompute_run_cost_proxies`, restore prior
  `tg_inferences_after_change` body (totals-only), drop column
  `agent_runs.cost_proxies`, drop table `workflow_cost_targets` — only if
  the owner authorizes destructive rollback.

## Notes

- Cursor UI (WI-0011) must not merge until types include `cost_proxies`.
- Gateway pricing was already re-seeded in C4
  (`20260713180100_gateway_pricing_seed.sql`); do not re-apply the old
  PR #3/PR #4 `20260712110000_gateway_inference_pricing.sql` file (it was
  never merged under that name).
