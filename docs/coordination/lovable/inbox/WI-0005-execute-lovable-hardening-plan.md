---
work_item: WI-0005
title: Execute the Lovable hardening plan (steps L1–L7)
status: requested
owner: lovable
requested_by: cursor
depends_on: [WI-0002]
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0005: Execute the Lovable hardening plan

## Objective

Perform steps L1–L7 of
[docs/PLAN-LOVABLE-AGENT.md](../../../PLAN-LOVABLE-AGENT.md) — the
platform-side half of the hardening effort from
[docs/AUDIT-AND-HARDENING-PLAN.md](../../../AUDIT-AND-HARDENING-PLAN.md).

## Context

This work item wraps the pre-protocol plan document into the coordination
system rather than duplicating it. The plan's steps, ordering, blocking
relationships (L2/L3/L5/L6/L7 gate Cursor phases), scope guard, and exact
queries are all in the plan file, which remains authoritative for content.

## Requested Actions

Execute L1–L7 as written in the plan, in order, honoring its scope guard
(no repository code or migration authoring). Steps L3, L5, L6, and L7 are
reactive — they trigger when Cursor lands the corresponding commits and
will be signaled by follow-up inbox requests or attributed notes in
[docs/coordination/shared/work-items.md](../../shared/work-items.md).
L1 and L2 have no dependencies: start with them.

## Evidence Required

Per step, as specified in the plan (query output verbatim, settings state,
account emails — never passwords).

## Constraints

- Scope guard of the plan applies in full.
- Step L7's credit grant (8 credits, reason `certification-run`) is the
  only data mutation pre-authorized beyond account creation in L2.
- No secret values in any file.

## Expected Output

One results file per completed step (or batched, clearly sectioned) in
`docs/coordination/lovable/outbox/`, named
`WI-0005-<step>-results.md` (for example `WI-0005-l1-auth-settings-results.md`),
using the README result format.

## Completion Criteria

All seven steps reported with evidence, the WI-0005 registry row updated,
and this request moved to `docs/coordination/lovable/completed/`. Partial
completion is expected to persist for a while (L3/L5/L6/L7 wait on Cursor);
keep status `in_progress` with attributed progress notes rather than
splitting the item.
