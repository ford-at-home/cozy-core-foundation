---
work_item: WI-0011
title: Cost calibration UI (SessionCostBanner, proxies, budget badges)
status: draft
owner: cursor
requested_by: cursor
depends_on: [WI-0010]
blocks: []
created: 2026-07-14
updated: 2026-07-14
priority: P1
---

# WI-0011: Cost calibration UI (Cursor half of PR #4 revive)

## Objective

Ship the UI that was unique to buried PR #4 once Lovable has applied
`20260714080000_cost_proxies_and_targets.sql` and regenerated types
(WI-0010).

## Scope (do not start until WI-0010 is completed)

- `src/components/SessionCostBanner.tsx` — piece-level session cost + budget
- `src/lib/costs.functions.ts` — `getSessionBudget`, `CostProxies`, session
  detail `budget`
- `src/components/RunCostCard.tsx` — proxy stats (dispatch est., research,
  duration, images, OCR)
- Dashboard run-cost column + session link (mobile cards + `md+` table)
- Session detail target vs actual badge
- Run page: banner + pass `cost_proxies` / `input_summary` into RunCostCard
- Extend `AgentRun` / `RUN_COLUMNS` to include `input_summary`,
  `cost_proxies`, `duration_ms`, `inference_count`

## Blocked on

WI-0010 evidence: migration applied, `cost_proxies` in generated types,
functions deployed.

## Notes

This file is a Cursor-owned draft tracker (not a Lovable inbox request).
Start implementation only after WI-0010 results land in
`docs/coordination/lovable/outbox/`.
