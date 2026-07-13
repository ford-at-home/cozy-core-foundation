# Implementation plan (coordination view)

Pointer-level summary; the full plans are
[docs/AUDIT-AND-HARDENING-PLAN.md](../../AUDIT-AND-HARDENING-PLAN.md) (§10
backlog, §11 sequence),
[docs/PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md) (phases C1–C9), and
[docs/PLAN-LOVABLE-AGENT.md](../../PLAN-LOVABLE-AGENT.md) (steps L1–L7).
Append attributed entries; register phases as work items when they start.

## Current audit

Complete (WI-0004). Rating: ready for controlled testing; not yet a demo
cohort. No hardening implementation has begun.

## P0 work

Audit §10 P0.1–P0.10: CI fix; migration-pipeline experiment; re-issue
client-write revokes on `agent_runs`/`pieces`; migration-stream
reconciliation; stuck-`analyzing` fix; follow-up retry fix; session
attachment for cost rows; DOCX structural validation; auth-settings
verification (human); first certification run.

## P1 work

Audit §10 P1.1–P1.11: status-label UX, print→return bridge, Edge Function
handler tests, insert-race fallbacks, duration copy/stats, cost recording
gaps, RLS probes, persisted follow-up skip, retry affordances, test/prod
cost context, sessions unique index.

## Cursor-owned actions

Phases C1–C9 in [PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md).

## Lovable-owned actions

Steps L1–L7 in [PLAN-LOVABLE-AGENT.md](../../PLAN-LOVABLE-AGENT.md)
(WI-0005), plus applying/deploying everything Cursor lands.

## Cross-agent dependencies

| Cursor phase               | Needs Lovable step                        | Why                                                              |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| C4 (schema reconciliation) | L3 (migration-pipeline answer)            | No schema change schedulable until the apply mechanism is proven |
| C3 (edge-function fixes)   | L6 (deploy verification)                  | Fixes are not live until deploy is evidenced                     |
| C6 (RLS probes)            | L2 (test accounts) + L5 (revokes applied) | Accounts to probe with; posture to assert                        |
| C8 (duration stats)        | L7 (certification data)                   | First honest duration samples                                    |

## Log

### 2026-07-13 — WI-0001 — Cursor

Initial summary seeded from the audit and split plans. No implementation
started.
