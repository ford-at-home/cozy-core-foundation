---
work_item: WI-0007
title: Verify Edge Function redeploy after the phase C3 + C7 commits
status: completed
owner: lovable
requested_by: cursor
depends_on: []
blocks: []
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0007: Edge Function deploy verification — Results

## Status

completed — all seven functions redeployed from current `main` source and
the new code paths verified.

## Actions Performed

1. Confirmed each function's source on `main` contains the C3/C7
   markers named in the request (see Evidence).
2. Called `supabase--deploy_edge_functions` for the full set:
   `analyze-returned-page`, `reconcile-runs`, `run-follow-up-research`,
   `create-final-document-job`, `create-presentation-job`,
   `start-workflow`, `prepare-follow-up-questions`. Deploy succeeded
   for all seven.
3. Invoked `POST /reconcile-runs` as the cheapest live signal for C3.
   Response body contained the new `stalePagesSwept` field, proving
   the deployed code is the post-C3 revision.

## Findings

### Deploy pipeline (for `docs/RUNBOOK.md`)

Edge Function deploys are **not** automatic on push to `main`. The
Lovable agent must call the `supabase--deploy_edge_functions` tool
with an explicit list of function names; deploys complete in seconds
per function. Function source in the repository is authoritative; the
deploy step publishes whatever is currently on `main` at call time.
Symptom of missing this step: `main` has new code but live invocations
behave like the old version.

### Per-function verification

| Function | C3/C7 marker in source | Deployed | Live evidence |
| --- | --- | --- | --- |
| `reconcile-runs` | `stalePagesSwept` (5 refs) | ✅ | `POST` returned `"stalePagesSwept": 0` |
| `analyze-returned-page` | env check before 'analyzing' flip; shared settle helper | ✅ | deploy success; not invoked (would need a real page) |
| `run-follow-up-research` | session attach + insert-race comment | ✅ | deploy success |
| `create-final-document-job` | session attach + insert-race comment | ✅ | deploy success |
| `create-presentation-job` | session attach + insert-race comment | ✅ | deploy success |
| `start-workflow` | orphaned-piece cleanup (source verified) | ✅ | deploy success |
| `prepare-follow-up-questions` | `followups_skipped` / `followups_reopened` event branch (line 124) | ✅ | deploy success; live `{ skip: true }` call deferred (would need an owned packet) |

## Evidence

Deployer response: `Successfully deployed edge functions:
analyze-returned-page, reconcile-runs, run-follow-up-research,
create-final-document-job, create-presentation-job, start-workflow,
prepare-follow-up-questions`.

`POST https://<project>.functions.supabase.co/reconcile-runs` (200):

```json
{
  "purchases": { "expired": 0, "flagged": 0, "healed": 0 },
  "reservationsResolved": 0,
  "scanned": 0,
  "stalePagesSwept": 0,
  "summary": {}
}
```

`stalePagesSwept` is the field introduced by commit `4fbd571` (C3).

Source markers grep (excerpt):
- `supabase/functions/reconcile-runs/index.ts` — 5 occurrences of
  `stalePagesSwept` / sweep logic.
- `supabase/functions/prepare-follow-up-questions/index.ts:124` —
  `event: skip ? "followups_skipped" : "followups_reopened"` (C7).
- `supabase/functions/{run-follow-up-research,create-final-document-job,create-presentation-job}/index.ts`
  — session_id attach comments confirming the C3 session-attach patch.

## Files or Resources Changed

None (deploy-only; no source or schema modification).

## Validation Performed

- Source grep for each requested marker.
- Successful deploy tool response for all seven functions.
- Live `POST /reconcile-runs` returned the new response shape.

## Remaining Risks

- `analyze-returned-page`, `run-follow-up-research`, the two job
  creators, `start-workflow`, and the skip branch of
  `prepare-follow-up-questions` were verified by source + deploy but
  not exercised end-to-end. Their C3/C7 code paths will be observed
  during the L7 certification runs (blocked on owner trigger).

## Blockers

None.

## Recommended Next Action

Cursor writes the deploy procedure ("not auto; call
`supabase--deploy_edge_functions` with the changed function names")
into `docs/RUNBOOK.md`. During L7 certification runs, Lovable will
capture the `stalePagesSwept > 0` and `followups_skipped` cases from
real logs as the final end-to-end confirmation.