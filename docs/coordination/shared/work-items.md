# Work-item registry

Authoritative index of all work items. Allocate IDs sequentially; **the next
free ID is claimed by adding its row here in the same commit as the request
file**. Never reuse an ID. Update rows via attributed entries in the log
below — the table row shows current state; the log preserves history.

**Next free ID: WI-0013**

| ID      | Title                                                          | Owner   | Requester | Status           | Priority | Depends on | Request file                                                                                                        | Result file                                                                                                                                  | Updated    |
| ------- | -------------------------------------------------------------- | ------- | --------- | ---------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| WI-0001 | Implement Cursor ↔ Lovable coordination protocol               | cursor  | human     | ready_for_review | P0       | —          | (this task; no inbox file — human-directed)                                                                         | [WI-0001 results](../cursor/outbox/WI-0001-coordination-protocol-results.md)                                                                 | 2026-07-13 |
| WI-0002 | Lovable adopts the coordination protocol                       | lovable | cursor    | requested        | P0       | WI-0001    | [WI-0002 request](../lovable/inbox/WI-0002-adopt-coordination-protocol.md)                                          | (pending)                                                                                                                                    | 2026-07-13 |
| WI-0003 | Legacy: backend verification of the connected Supabase project | lovable | cursor    | completed        | P0       | —          | [Original brief](../../LOVABLE-BACKEND-VERIFICATION.md)                                                             | [WI-0003 pointer](../lovable/outbox/WI-0003-backend-verification-legacy-results.md) → [findings](../../lovable-backend-research-findings.md) | 2026-07-13 |
| WI-0004 | Legacy: application audit and hardening plan                   | cursor  | human     | completed        | P0       | WI-0003    | (human-directed audit task)                                                                                         | [WI-0004 pointer](../cursor/outbox/WI-0004-audit-and-hardening-plan-legacy-results.md) → [plan](../../AUDIT-AND-HARDENING-PLAN.md)           | 2026-07-13 |
| WI-0005 | Execute the Lovable hardening plan (steps L1–L7)               | lovable | cursor    | in_progress      | P0       | WI-0002    | [WI-0005 request](../lovable/inbox/WI-0005-execute-lovable-hardening-plan.md) → [plan](../../PLAN-LOVABLE-AGENT.md) | [interim report](../../lovable-plan-execution.md) (L1+L4 done; L2/L3/L5–L7 pending)                                                          | 2026-07-13 |
| WI-0006 | Migration pipeline experiment (apply the marker migration, L3) | lovable | cursor    | completed        | P0       | —          | [WI-0006 request](../lovable/completed/WI-0006-migration-pipeline-experiment.md)                                    | [WI-0006 results](../lovable/outbox/WI-0006-migration-pipeline-experiment-results.md)                                                        | 2026-07-13 |
| WI-0007 | Verify Edge Function redeploy after phase C3 + C7 (L6)         | lovable | cursor    | completed        | P0       | —          | [WI-0007 request](../lovable/completed/WI-0007-deploy-verification-c3.md)                                           | [WI-0007 results](../lovable/outbox/WI-0007-deploy-verification-c3-results.md)                                                               | 2026-07-13 |
| WI-0008 | Apply + verify the phase C4 schema reconciliation (L5)         | lovable | cursor    | requested        | P0       | WI-0006    | [WI-0008 request](../lovable/inbox/WI-0008-apply-c4-schema-reconciliation.md)                                       | (pending)                                                                                                                                    | 2026-07-13 |
| WI-0009 | Apply + verify the phase C8 duration fix + stats view          | lovable | cursor    | requested        | P0       | WI-0008    | [WI-0009 request](../lovable/inbox/WI-0009-apply-c8-duration-stats.md)                                              | (pending)                                                                                                                                    | 2026-07-13 |
| WI-0010 | Apply cost-proxies migration + deploy dispatch + regen types   | lovable | cursor    | requested        | P1       | WI-0008    | [WI-0010 request](../lovable/inbox/WI-0010-apply-cost-proxies-and-targets.md)                                       | [Cursor step1](../cursor/outbox/WI-0010-cost-proxies-step1-results.md) · Lovable apply (pending)                                              | 2026-07-14 |
| WI-0011 | Cost calibration UI (SessionCostBanner, proxies, budgets)      | cursor  | cursor    | draft            | P1       | WI-0010    | [WI-0011 plan](../cursor/outbox/WI-0011-cost-calibration-ui-plan.md)                                                | (blocked on WI-0010)                                                                                                                         | 2026-07-14 |
| WI-0012 | How It Works page (Lovable Cloud + Cursor Agents)              | cursor  | human     | completed        | P2       | —          | (human-directed; tracker in outbox)                                                                                 | [WI-0012 results](../cursor/outbox/WI-0012-how-it-works-page.md)                                                                             | 2026-07-16 |

The Cursor-side hardening phases (C1–C9 in
[PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md)) will be registered as
work items when each phase begins, so that cross-agent dependencies (C4
needs L3; C6 needs L2+L5; C8 needs L7) are tracked here explicitly.

## Log

### 2026-07-16 — WI-0012 — Cursor

Human-directed public engineering page: canonical markdown at
`content/how-it-works.md`, route `/how-it-works`, suite footer link. Documents
the Cursor ↔ Lovable development workflow, nested product runtime
(control/execution planes), and Cursor cost-management capabilities/limits.
No Lovable backend action required beyond normal `main` app sync.

### 2026-07-14 — WI-0010 + WI-0011 — Cursor

Reviving buried PR #4 (cost calibration) in two steps so the client never
selects `cost_proxies` before it exists live:

1. **WI-0010 (Lovable)** — apply `20260714080000_cost_proxies_and_targets.sql`,
   deploy `start-workflow` / `piece-action` / `reconcile-runs` (research_chars
   at dispatch), regenerate `src/integrations/supabase/types.ts`.
2. **WI-0011 (Cursor, draft/blocked)** — SessionCostBanner, budget badges,
   RunCostCard proxies, dashboard cost column — only after WI-0010 evidence.

Repo Step 1 also adds `docs/COST-CALIBRATION.md` and dispatch `researchChars`.
Gateway pricing from the old PR was already superseded by C4's
`20260713180100_gateway_pricing_seed.sql` — not re-applied.

### 2026-07-13 — WI-0009 — Cursor

Lovable's L7 certification sweep (WI-0005 results) re-confirmed the P0
`duration_ms = 0` defect and delivered the first honest wall times. Phase
C8 landed on `main`: `20260713184000_run_duration_stats.sql` (BEFORE
trigger stamping duration on completion + backfill + `run_duration_stats`
view with an n≥10 gate) and UI that reads the view ("usually X–Y minutes,
based on recent runs") with non-numeric fallback until stats exist.
WI-0009 filed for apply + verify, sequenced after WI-0008.

### 2026-07-13 — WI-0008 — Cursor

Phase C4 (schema reconciliation) landed on `main`: two new migrations
(`20260713180000_reconcile_live_schema.sql` — M1/M2 revokes, sessions
unique index, `inferences.context`; `20260713180100_gateway_pricing_seed.sql`
— five gateway pricing rows), refinement/transcription cost recording, and
deletion of the ten stale hand-authored migration files (P0.4). WI-0008
filed to Lovable's inbox: apply both migrations per the WI-0006 procedure,
deploy `prepare-follow-up-questions`, and re-verify the L5 baseline.

### 2026-07-13 — WI-0006 + WI-0007 — Lovable

Both executed. WI-0006: Cursor-authored migrations do NOT auto-apply;
applied the marker via `supabase--migration`, version `20260713160000`
now present in `schema_migrations`. Procedure documented in the outbox
for `docs/RUNBOOK.md`; WI-0008 (phase C4) is unblocked. WI-0007: Edge
Function deploys are NOT automatic on push; called
`supabase--deploy_edge_functions` for all seven changed functions
(analyze-returned-page, reconcile-runs, run-follow-up-research,
create-final-document-job, create-presentation-job, start-workflow,
prepare-follow-up-questions). Live `POST /reconcile-runs` returned the
new `stalePagesSwept` field, confirming C3 code is live. Full evidence
in the outbox files.

### 2026-07-13 — WI-0007 amended — Cursor

Phase C7 (recovery/progress UX, commit `b96d11a`) landed on `main`. It is
mostly frontend, but it also extended the `prepare-follow-up-questions`
Edge Function with a skip mode (persists the optional follow-up skip as
`followups_skipped`/`followups_reopened` piece events — audit P1.8).
WI-0007's request file was amended to cover that function's deploy in the
same verification pass; no new work item needed.

### 2026-07-13 — WI-0007 — Cursor

Phase C3 defensive backend fixes landed on `main` (commit `4fbd571`):
stale-'analyzing' page sweep, final-artifact structural validation, session
attach in the three job-creation functions, insert-race fallbacks, followup
requestId rotation. WI-0007 filed to Lovable's inbox to verify the Edge
Function redeploy (plan step L6).

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
