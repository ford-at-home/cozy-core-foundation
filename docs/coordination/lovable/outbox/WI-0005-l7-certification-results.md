---
work_item: WI-0005
step: L7
status: complete
owner: lovable
created: 2026-07-13
---

# WI-0005 · L7 — Certification run verification

## Setup

- Test accounts (created via normal signup, email-confirmed):
  - Account A: `priorww+test-a-hardcopy@gmail.com`
  - Account B: `priorww+test-b-hardcopy@gmail.com`
- Pre-run credit grant: **+8 credits to Account A**, reason
  `certification-run`, via `admin_adjust_credits` (ledger entry
  `admin_adjustment`, actor `lovable-agent`).

## Runs executed (owner-driven, signed in as A / B)

| run_id | kind | account | status | wall time | total_cost_usd |
|---|---|---|---|---|---|
| 2831c500…000e | proposal (paste-entry) | B | completed | ~14m59s | 0.75 |
| 41eca6e5…b92d | proposal (paste-entry) | A | completed | ~16m46s | 0.75 |
| 317fce66…2853 | research (topic-entry) | A | completed | ~6m09s | 3.00 |
| f57987bc…48ed | packet (topic-entry follow-on) | A | completed | ~6m41s | 0.75 |

All four reached `completed`. No errors. The topic-entry flow chained
research → packet automatically.

## Verification sweep (queries from PLAN-LOVABLE-AGENT.md · L7)

### Durations by kind (completed only)

```
kind      count  min(duration_ms)  max(duration_ms)
draft         2  NULL              NULL
research      3  0                 0
proposal      4  0                 0
packet        2  0                 0
revision      1  350387            350387
```

**Finding (unchanged from prior audit):** `duration_ms` is still `0`
for every terminal kind except `revision`. `dispatched_at` and
`completed_at` are both populated (see run table above — real wall
times are 6–16 minutes), so `recompute_run_totals` is not applying its
`EXTRACT(EPOCH FROM completed_at - dispatched_at) * 1000` branch on
these rows. This matches the P0 defect flagged in
`docs/AUDIT-AND-HARDENING-PLAN.md` §12 and needs a Cursor-side fix
(likely the trigger firing order — `tg_agent_runs_after_change`
recomputes session totals but nothing recomputes the run's own
`duration_ms` on `agent_runs.completed_at` update; `recompute_run_totals`
only fires from `tg_inferences_after_change`).

### Stuck-row sweeps

All four sweeps return **0 rows**:
- `agent_runs` non-terminal older than 1h — none
- `page_images` status `analyzing` older than 30m — none
- `final_artifacts` status `pending` older than 1h — none
- `credit_reservations` status `held` older than 2h — none

### Cost rows for follow-up / final runs

No `followup_research` / `final_docx` / `final_pptx` runs exist yet
(the owner did not trigger those stages in this session — the runs
completed at the research/proposal/packet level). The
`session_id`-fix cannot be re-verified from this dataset; needs a
follow-up certification run that goes all the way through
`final_docx`.

### Ledger consistency

`balance = ledger_sum − held` holds for every account: query returns
0 rows. Test accounts specifically:

```
priorww+test-a-hardcopy@gmail.com  balance=8   ledger_sum=8
priorww+test-b-hardcopy@gmail.com  balance=2   ledger_sum=2
```

A: 3 signup + 8 certification grant − 3 (research) = 8 ✓
B: 3 signup − 1 (proposal) = 2 ✓

## Outstanding for Cursor

1. **P0 — `duration_ms` never populated on run completion.** Trigger
   `recompute_run_totals` on `agent_runs` completion (or set
   `duration_ms` directly in the completion path). This blocks every
   duration metric in the dashboard.
2. **L7 not fully certified end-to-end.** Owner needs to drive one run
   through follow-up research → final_docx → final_pptx so the
   session_id/cost-attribution fix can be verified. Account A still
   has 8 credits available for this.

## Files / mutations in this step

- `admin_adjust_credits(user_id_A, +8, 'certification-run',
  'lovable-agent', 'certification-run:2026-07-13')` — applied.
- No schema or code changes.
