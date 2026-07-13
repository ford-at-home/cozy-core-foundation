---
work_item: WI-0004
title: "Legacy: application audit and hardening plan"
status: completed
owner: cursor
requested_by: human
depends_on: [WI-0003]
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0004: Application audit and hardening plan — Results (legacy pointer)

> Registered retroactively during protocol setup (WI-0001). Completed
> before the coordination protocol existed; this pointer registers the
> deliverables without duplicating them.

## Status

Completed 2026-07-13.

## Actions Performed

Full production-readiness audit of the repository (system boundary, primary
Word-document workflow trace, UX, reliability, testing, cost tracking,
progress/timing), validation-suite execution, integration of Lovable's
backend verification (WI-0003) with cross-checking, and a prioritized
backlog plus split execution plans.

## Findings / Evidence

Authoritative documents:

- [docs/AUDIT-AND-HARDENING-PLAN.md](../../../AUDIT-AND-HARDENING-PLAN.md)
  — the audit (12 sections, incl. handoff validation §0, backlog §10,
  sequence §11, unknowns §12).
- [docs/PLAN-CURSOR-AGENT.md](../../../PLAN-CURSOR-AGENT.md) — Cursor
  phases C1–C9.
- [docs/PLAN-LOVABLE-AGENT.md](../../../PLAN-LOVABLE-AGENT.md) — Lovable
  steps L1–L7 (now WI-0005).

## Files or Resources Changed

Documents only; no application code, database resources, or deployed
systems were changed.

## Validation Performed

Full deterministic suite executed 2026-07-13: typecheck, 147 vitest, build,
88 Deno tests, three guard scripts — pass; `npm run lint` fails with 19
pre-existing Prettier errors (backlog P0.1); CI on `main` red for the same
reason.

## Remaining Risks

See audit §5–§6 and
[docs/coordination/shared/blockers.md](../../shared/blockers.md).

## Blockers

None for this (completed) item.

## Recommended Next Action

Begin Cursor phase C1 (CI fix) once the owner green-lights implementation.
