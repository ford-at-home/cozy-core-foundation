# Work-item registry

Authoritative index of all work items. Allocate IDs sequentially; **the next
free ID is claimed by adding its row here in the same commit as the request
file**. Never reuse an ID. Update rows via attributed entries in the log
below — the table row shows current state; the log preserves history.

**Next free ID: WI-0007**

| ID      | Title                                                          | Owner   | Requester | Status           | Priority | Depends on | Request file                                                                                                        | Result file                                                                                                                                  | Updated    |
| ------- | -------------------------------------------------------------- | ------- | --------- | ---------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| WI-0001 | Implement Cursor ↔ Lovable coordination protocol               | cursor  | human     | ready_for_review | P0       | —          | (this task; no inbox file — human-directed)                                                                         | [WI-0001 results](../cursor/outbox/WI-0001-coordination-protocol-results.md)                                                                 | 2026-07-13 |
| WI-0002 | Lovable adopts the coordination protocol                       | lovable | cursor    | requested        | P0       | WI-0001    | [WI-0002 request](../lovable/inbox/WI-0002-adopt-coordination-protocol.md)                                          | (pending)                                                                                                                                    | 2026-07-13 |
| WI-0003 | Legacy: backend verification of the connected Supabase project | lovable | cursor    | completed        | P0       | —          | [Original brief](../../LOVABLE-BACKEND-VERIFICATION.md)                                                             | [WI-0003 pointer](../lovable/outbox/WI-0003-backend-verification-legacy-results.md) → [findings](../../lovable-backend-research-findings.md) | 2026-07-13 |
| WI-0004 | Legacy: application audit and hardening plan                   | cursor  | human     | completed        | P0       | WI-0003    | (human-directed audit task)                                                                                         | [WI-0004 pointer](../cursor/outbox/WI-0004-audit-and-hardening-plan-legacy-results.md) → [plan](../../AUDIT-AND-HARDENING-PLAN.md)           | 2026-07-13 |
| WI-0005 | Execute the Lovable hardening plan (steps L1–L7)               | lovable | cursor    | in_progress      | P0       | WI-0002    | [WI-0005 request](../lovable/inbox/WI-0005-execute-lovable-hardening-plan.md) → [plan](../../PLAN-LOVABLE-AGENT.md) | [interim report](../../lovable-plan-execution.md) (L1+L4 done; L2/L3/L5–L7 pending)                                                          | 2026-07-13 |
| WI-0006 | Migration pipeline experiment (apply the marker migration, L3) | lovable | cursor    | requested        | P0       | —          | [WI-0006 request](../lovable/inbox/WI-0006-migration-pipeline-experiment.md)                                        | (pending)                                                                                                                                    | 2026-07-13 |

The Cursor-side hardening phases (C1–C9 in
[PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md)) will be registered as
work items when each phase begins, so that cross-agent dependencies (C4
needs L3; C6 needs L2+L5; C8 needs L7) are tracked here explicitly.

## Log

### 2026-07-13 — WI-0006 — Cursor

Marker migration `supabase/migrations/20260713160000_pipeline_marker.sql`
pushed (phase C2); WI-0006 filed to Lovable's inbox to run the pipeline
experiment (plan step L3). WI-0005 updated to `in_progress` — Lovable's
interim report ([lovable-plan-execution.md](../../lovable-plan-execution.md))
covers L1 (auth settings done) and L4 (confirming queries done: rollup
triggers exist; no `lovable`/`openai` pricing rows; duration recording
patchy).

### 2026-07-13 — WI-0001 — Cursor

Registry created; WI-0001 through WI-0005 allocated. WI-0001 is this
protocol implementation (status `ready_for_review` pending human review and
WI-0002 adoption). WI-0003/WI-0004 register the pre-protocol handoffs as
legacy items without duplicating their content. WI-0005 hands the existing
Lovable execution plan into the new inbox format.
