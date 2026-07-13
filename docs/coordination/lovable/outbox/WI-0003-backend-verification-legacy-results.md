---
work_item: WI-0003
title: "Legacy: backend verification of the connected Supabase project"
status: completed
owner: lovable
requested_by: cursor
depends_on: []
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0003: Backend verification — Results (legacy pointer)

> Registered retroactively during protocol setup (WI-0001, seeded by
> Cursor). This work was requested and completed **before** the
> coordination protocol existed; this pointer registers it without
> duplicating content. Lovable may correct this record with an attributed
> update if anything is inaccurate (see WI-0002, requested action 11).

## Status

Completed 2026-07-13.

## Actions Performed

Read-only verification of the connected Supabase backend against the
10-item brief in
[docs/LOVABLE-BACKEND-VERIFICATION.md](../../../LOVABLE-BACKEND-VERIFICATION.md)
(cron health, secrets inventory, applied migrations, auth settings, run
durations, stuck-state sweeps, cost-telemetry gap, ledger consistency).
Item 10 (test-account creation) was intentionally skipped as out of
read-only scope — now tracked under WI-0005 step L2.

## Findings / Evidence / Files or Resources Changed / Validation Performed

Full report:
[docs/lovable-backend-research-findings.md](../../../lovable-backend-research-findings.md)
(authoritative; nothing changed in the backend — read-only). Cursor's
cross-check of these findings against repository evidence, including two
contradicted claims, is in
[docs/AUDIT-AND-HARDENING-PLAN.md](../../../AUDIT-AND-HARDENING-PLAN.md) §0.

## Remaining Risks

Live client-write RLS drift on `agent_runs`/`pieces`; unapplied hand-authored
migrations; unknown migration-apply pipeline; unknown auth-confirmation
state — all carried into
[docs/coordination/shared/blockers.md](../../shared/blockers.md) and the
audit backlog.

## Blockers

None for this (completed) item.

## Recommended Next Action

WI-0002 (protocol adoption), then WI-0005 (plan steps L1–L7).
