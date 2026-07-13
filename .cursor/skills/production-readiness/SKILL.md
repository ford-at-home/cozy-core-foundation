---
name: production-readiness
description: Pre-merge and pre-release review of Hardcopy Draft changes — run every required check, verify failure/loading/retry states, confirm no secret leakage, list unresolved risks and rollback options. Use for tasks mentioning release, ship, production, final review, hardening, resilience, error states, or "is this ready". Also the skill for reviewing failure behavior (loading, empty, timeout, retry, partial failure).
---

# production-readiness

## Purpose

Prove a change is safe to merge into a branch that auto-syncs to Lovable and
deploys. Two halves: (1) run the full deterministic check suite; (2) walk the
failure states this system is known to have — degraded providers, stuck runs,
exhausted credits, blocked print dialogs — and confirm the change behaves
sanely in each one it touches.

## Use this skill when

- A task says release, ship, production, harden, "bug bash", final review, or
  "make sure nothing is broken".
- Reviewing failure behavior: loading, empty, timeout, retry, partial failure.
- As the last step of any multi-file change, before the final report.

## Do not use this skill when

- Mid-implementation. Finish the change with its specialist skill first; this
  skill is the exit gate.

## Required context

- The full diff being reviewed (`git diff main...HEAD` or the PR).
- `docs/RUNBOOK.md` — operational failure modes and recovery paths.
- `docs/BILLING.md` — money rules, if the diff touches credits or Stripe.
- `docs/ARCHITECTURE.md` → Missing/External sections (so you don't demand
  checks that can't exist, like React component test suites).

## Procedure

### 1. Deterministic checks (all must pass)

| Check                               | Command                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| Lint                                | `npm run lint`                                              |
| Types                               | `npm run typecheck`                                         |
| Vitest (markdown + print fidelity)  | `npm test` (Chromium via `npx playwright install chromium`) |
| Production build                    | `npm run build`                                             |
| Edge function tests                 | `npm run test:functions`                                    |
| Secret scan (source + built assets) | `bash scripts/check-secrets.sh`                             |
| Migration RLS check                 | `bash scripts/check-migrations.sh`                          |
| Print contract sync                 | `bash scripts/check-print-contract.sh`                      |

Run all of them even if the change "obviously" doesn't affect an area — the
suite is cheap and CI (`.github/workflows/ci.yml`) runs it anyway.

### 2. Failure-state walkthrough

For each area the diff touches, confirm behavior in this system's known
degraded states:

**Runs / orchestration**

- Stub provider active (no `CURSOR_API_KEY`): runs get `bc_stub_…` ids and no
  content — UI must not mislead.
- `dispatch_unknown` runs: auto-failed after 30 min with guidance; a research
  run stuck >45 min is failed with guidance (RUNBOOK).
- Webhooks disabled: the reconciler alone must still complete runs.
- A failed run must be visibly failed with its error surfaced, not spinning
  forever; `agent_run_events` is the debugging trail.

**UI data states**

- Loading: every query the change touches has a loading state (existing
  pattern: muted text / `aria-busy`).
- Empty: zero runs / zero sessions / missing profile don't render broken
  layouts.
- Error: Supabase errors surface via the existing toast/alert patterns
  (`role="alert"`, sonner toasts), not silent console noise.
- Realtime disconnect: pages still work by refetch, realtime is enhancement.

**Credits / billing (`docs/BILLING.md` + `billing-and-credits` skill)**

- A run that fails, is cancelled, or gets stuck must release its credit
  reservation (reconciler sweep); a system failure must never consume a
  user's credit.
- Insufficient credits at dispatch: the paywall path
  (`isInsufficientCreditsError`, `/billing`) responds cleanly — no half-created
  runs.
- Duplicate Stripe webhook delivery is a no-op (`stripe_events` inbox); the
  success redirect grants nothing.
- `CREDITS_MODE=log` remains a working rollback lever if enforcement breaks.
- Financial invariants hold: ledger append-only, balance = projection,
  refunds/chargebacks are reversal entries (the consistency SQL in
  `docs/BILLING.md` → Operations is the check).
- **Before any release involving live Stripe keys**: the full Stripe CLI
  test-mode plan in `docs/BILLING.md` → Test plan must have passed —
  including the duplicate-event replay, the invalid-signature rejection,
  refund/dispute triggers, and the **mobile checkout smoke test**
  (checkout from a phone → `/billing?status=success` → balance updates;
  canceled checkout preserves prior state). Test mode first, always.

**Research-packet workflow (project hub and its sub-surfaces)**

- A failed page photo gets named retake reasons (quality gate in
  `analyze-returned-page`), never fabricated text; the return keeps its
  other pages.
- `final_artifacts` rows must never sit `pending` after their run dies —
  the failure paths settle them to `failed` and the Finish card offers a
  retry with a fresh `requestId` (new run, no double-charge).
- Follow-up and final-artifact dispatch surface `insufficient_credits` with
  the paywall pattern; every billable button states its cost first.
- The hub stage model derives from rows (`src/lib/packet-stage.ts`), so it
  must stay correct when `pieces.workflow_stage` lags; `piece_events` is
  display-only history, never load-bearing.

**External providers**

- Lovable gateway 402 ("Out of AI credits"): transcription and image paths
  degrade with the established message; a system failure must not appear as
  user error (and vice versa).

**Print**

- Iframe load watchdog (8s), popup-blocked fallback, run-not-completed
  message — still intact if the print page changed.

### 3. Risk and rollback review

- Migrations: are they idempotent on replay? What is the rollback story
  (forward-fix migration is the norm here — say so explicitly)?
- New secrets/config: documented in RUNBOOK (or BILLING.md for Stripe) and
  listed as manual actions?
- Kill switches still valid (unset `CURSOR_API_KEY` / pause cron /
  `CREDITS_MODE=log`)?
- Anything on the Lovable-synced branch that would leave it in a non-working
  state (the AGENTS.md Lovable rule)?

### 4. Verdict

State one of: **ready**, **ready with manual actions** (list them), or
**not ready** (list blockers). No hedged "should be fine".

## Validation

This skill _is_ validation; its own success criteria:

- [ ] All eight deterministic checks executed with their real output reported.
- [ ] Every failure state relevant to the diff explicitly addressed (or marked
      not applicable with a reason).
- [ ] A verdict with zero unstated assumptions about external systems.

## Failure modes

- Running only the checks the change "should" affect and missing a cross-area
  break (e.g. a shared component change breaking the build of another route).
- Declaring readiness with claims about dashboard/deployed state that cannot
  be verified from the repo — those belong in "manual actions".
- Treating red checks as advisory. A failing check means **not ready**; either
  fix it or report it as a blocker. Never weaken a check script to get green.
- Inventing requirements this repo doesn't have (React component test
  coverage, staging environments) instead of the verified check set.
- Skipping the failure-state walkthrough because the happy path works.

## Output contract

```
Checks: <each command → pass/fail (+ output on fail)>
Failure states reviewed: <state → behavior confirmed / N/A + reason>
Risks: <unresolved risks or "None">
Rollback: <strategy for this change>
Manual actions: <list or "None">
Verdict: ready | ready with manual actions | not ready
```

## References

- `docs/RUNBOOK.md` (operating notes, kill switch, deferred features)
- `.github/workflows/ci.yml` (the same gate, mechanically enforced)
