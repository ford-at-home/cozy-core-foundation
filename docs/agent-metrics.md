# Agent-run metrics — 30-day measurement runbook

**Purpose.** Convert the model-selection and spend-optimization policy from
a set of principles into a set of numbers, so we can tell whether the
policy is working and adjust it before an expensive month reveals the
problem after the fact.

**Companion documents:**

- [docs/cursor-model-selection-research.md](cursor-model-selection-research.md)
  §18 — the source of this runbook.
- [.cursor/skills/model-selection-and-spend/SKILL.md](../.cursor/skills/model-selection-and-spend/SKILL.md)
  — advisory routing skill.
- [docs/CURSOR-CONFIG.md](CURSOR-CONFIG.md) — where the enforceable
  controls this measurement drives ultimately live.
- [docs/coordination/README.md](coordination/README.md) —
  `model_class` + `estimated_cost_usd` fields on work items.

## Metrics

| Metric                                    | Source                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Runs by model                             | Cursor `dashboard/usage` filtered by user + surface; Admin API (Teams/Enterprise)  |
| Tasks by class                            | `model_class` frontmatter on work items; PR label if used                          |
| Cost by task / work item                  | Usage-dashboard per-request cost joined to WI via label or PR title                |
| First-attempt success                     | PR outcome / test pass on the first agent turn (git history + CI status)           |
| Retries per task                          | Conversation history; `beforeSubmitPrompt` / `stop` hook log if enabled            |
| Escalation rate (% tasks hitting premium) | Model mix by task class from the dashboard                                         |
| Human intervention rate                   | Reviewer notes; reverted-diff count (`git log --grep=revert`)                      |
| Elapsed time per run                      | CLI stream events (per-request timing); Cloud Agent run duration                   |
| Reverted changes                          | Git revert commits; PR-close-without-merge count                                   |
| Test failures                             | CI failure count by branch                                                         |
| Defect escape rate                        | Post-merge bug tracking (issues / hotfix PRs by originating commit)                |
| Premium-model utilization                 | API-pool cost ÷ (API-pool + Auto/Composer pool) cost from the usage dashboard      |
| Cost per completed task                   | Total Cursor spend ÷ merged PR count for the review window                         |

## Sources — what can and cannot be measured from the repo

**Available from Cursor directly:** runs by model, cost per request,
per-surface breakdown (clients / Cloud Agents / automations / Bugbot /
Security Review). The Admin API automates the pull on Teams / Enterprise;
Enterprise adds a paged CSV export (10,000 records / page).

**Available from the repo:** git history (revert / retry commits), CI
status per commit, PR outcomes, work-item frontmatter (`model_class`,
`estimated_cost_usd`), and the optional `## Model and Cost` results
section.

**Requires a hook or manual logging:** retries per task, escalation
sequence within a task, model change mid-task. The Cursor usage dashboard
records cost but not retry count. If retry counting becomes important, add
a `.cursor/hooks.json` `beforeSubmitPrompt` / `stop` hook that appends
`{timestamp, model, prompt-hash, task-label}` to a local CSV — the
research doc lists this as the recommended low-cost approach.

**Not measurable from the repo at all:** any per-user spend cap enforcement
(Enterprise dashboard only), Cloud Agent per-run token totals ahead of
completion, and any signal that Cursor's roster has rotated without an
explicit changelog check.

## Cadence

- **Weekly (15 min).** Filter `dashboard/usage` by user and by surface for
  the past week. Copy the "cost by model class" and "cost by surface"
  numbers into the review-log section below. Compare against the three
  decision thresholds. Note any WIs whose observed cost differed from the
  request's `estimated_cost_usd` by more than 2×.
- **On each Cloud Agent run before dispatch.** Confirm the account spend
  limit is set (see
  [CURSOR-CONFIG.md → Cloud Agents caveats](CURSOR-CONFIG.md#cloud-agents-caveats))
  and that the routing choice matches the skill's task taxonomy.
- **Monthly (end of billing cycle).** Reconcile total Cursor spend against
  the sum of WI `estimated_cost_usd` values for WIs whose owner was
  `cursor` and whose window falls in the cycle. Update the recommended
  settings in
  [CURSOR-CONFIG.md](CURSOR-CONFIG.md#recommended-settings) if any
  decision threshold has been crossed.

## Decision thresholds (from research §18)

Apply these mechanically at the weekly review:

1. **Premium-pool cost > ~25 % of total spend** → tighten the escalation
   checklist in the skill (or its interpretation): either the §9 signals
   are firing too easily, or agents are picking premium without a firing
   signal. First-line remediation: audit the last two weeks of WI
   `model_class` fields for `premium` entries and confirm each maps to a
   §9 signal.
2. **First-attempt success on Composer 2.5 < ~70 % for a task class** →
   promote that class's default to Sonnet-class. Edit the task taxonomy
   in the skill and the affected task template in
   [docs/AGENT-PROMPTS.md](AGENT-PROMPTS.md).
3. **> 3 average retries on a task class** → escalate that class earlier
   (add an earlier trigger for that class to the escalation checklist).
   Retries are the specific waste signal the escalation policy exists to
   prevent.

## Review log

Append attributed entries below at each weekly review. Do not rewrite
prior entries; the log is history.

Template:

```markdown
### YYYY-MM-DD — <reviewer> — window: YYYY-MM-DD → YYYY-MM-DD

Total spend: $X.XX (API pool $A.AA, Auto/Composer pool $B.BB)
Premium share: X% (threshold 25%)
Composer first-attempt: X% for routine, Y% for standard (threshold 70%)
Retries: avg X per task class (threshold 3)

Actions taken:
- (or "None")

Follow-ups:
- (or "None")
```

_(Log starts here — add the first entry after the initial 7 days of the
policy being in force.)_

## Limitations

- The measurement joins depend on `model_class` and `estimated_cost_usd`
  being populated on WIs. These fields are optional in the coordination
  protocol; expect coverage to grow over time rather than being complete
  from day one. Existing WI-0001 – WI-0007 do not carry them.
- Cursor's usage dashboard aggregates by day and by user; per-task
  attribution requires matching by prompt / PR title / label rather than
  a first-class field.
- Retry counting is best-effort without a hook. If a task class's retry
  count matters for a policy decision, add the hook first, then re-review
  once seven days of hook logs are available.
