---
name: model-selection-and-spend
description: Decide which Cursor model class to use, when to escalate to a premium model, and how to keep spend within policy. Use for tasks mentioning model choice, escalation, Cloud Agent dispatch, Composer / Sonnet / Opus, premium models, release certification, Max Mode, spend limits, cost tracking, or any decision where the wrong model class would waste money (or, worse, produce low-quality output on a high-risk change). Advisory only — this skill cannot switch the active model; the enforceable controls live in docs/CURSOR-CONFIG.md.
---

# model-selection-and-spend

## Purpose

Pick the right Cursor model class for the task at hand, escalate on
objective signals, and record enough metadata for the 30-day measurement
process in [docs/agent-metrics.md](../../docs/agent-metrics.md). The
detailed policy baseline — capabilities, pricing, task taxonomy, escalation
signals, cost tradeoffs — lives in
[docs/cursor-model-selection-research.md](../../docs/cursor-model-selection-research.md).
**Read that document as authoritative input; do not re-research.** This
skill is the working checklist and the routing layer.

## What this skill can and cannot do

**Repository files never switch the active model.** Rules
(`.cursor/rules/*.mdc`), `AGENTS.md`, and this skill are context injected
into whichever model the human, IDE, CLI, SDK, or Cloud Agents API is
already running. They are advisory routing guidance.

**Every enforceable control lives outside this repo.** They are documented
in [docs/CURSOR-CONFIG.md](../../docs/CURSOR-CONFIG.md):

- IDE Settings → Models: enabled list + global default
- Team default model, team blocklist (Teams / Enterprise)
- Team spend limits + soft-limit alerts (50 / 80 / 100 %)
- Cursor CLI `-m` / `--model` / `/model`, `cli-config.json`
- SDK `Agent.create({ model: { id, params } })`
- Cloud Agents REST API `POST /v1/agents` `model` field
- Per-subagent `model` inside a Cloud Agents run
- Custom Modes (beta) — the closest thing to a pre-wired preset
- A `beforeSubmitPrompt` guardrail hook (`deny` / `ask` only — cannot
  switch models; no hooks file is currently checked in, see
  [CURSOR-CONFIG.md → Optional guardrail hook](../../docs/CURSOR-CONFIG.md#optional-guardrail-hook))
- Per-user spend limits (Enterprise only)

If your task needs enforcement, edit the environment surface — not this
skill.

## The routing baseline

**Default: Composer 2.5** in the IDE, or **Auto** on Teams (Auto is exempt
from the Cursor Token Rate). Both draw from the cheap included pool; every
explicitly-selected frontier model is metered against the API pool at
provider list price. See
[research §4](../../docs/cursor-model-selection-research.md#4-billing-and-usage-model)
for the two-pool billing model.

**Escalation ladder:**

| Class                | Use for                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Cheap-fast           | Doc edits, formatting, lint, file moves, small UI, unit-test fixtures, repo search             |
| General coding       | Standard React / TS features, straightforward bug fixes, component tests, Playwright E2E       |
| High-intelligence    | Cross-module refactors, Supabase migrations, Edge Functions, auth / RLS *implementation*       |
| Premium reasoning    | Architecture, concurrency, root-cause analysis, security review, data-migration planning, release certification (as **planner or reviewer**, rarely as executor) |

Preferred models (July 2026 snapshot; substitute the current in-product
equivalent when the roster rotates and log the substitution in
[docs/CURSOR-CONFIG.md → Model substitution log](../../docs/CURSOR-CONFIG.md#model-substitution-log)):

- Cheap-fast / General → **Composer 2.5** (or Auto on Teams)
- High-intelligence → **Claude Sonnet-class** (Sonnet 4.6 / Sonnet 5)
- Premium reasoning → **Claude Opus-class** (Opus 4.8) or **GPT-5.5**

## Task class → model class (this repo)

Keyed to the work that actually happens here. Compressed from
[research §7](../../docs/cursor-model-selection-research.md#7-task-complexity-taxonomy)
and
[§8](../../docs/cursor-model-selection-research.md#8-model-routing-matrix).

| Repo work                                                                                          | Default            | Escalate to        | Premium review?         |
| -------------------------------------------------------------------------------------------------- | ------------------ | ------------------ | ----------------------- |
| Docs, brand copy, README, format / lint fixes, code comments                                       | Composer 2.5       | —                  | No                      |
| Mobile UI polish (`mobile-ui-polish`), small responsive fixes, touch-target work                   | Composer 2.5       | Sonnet if design-sensitive | No              |
| Print layout / PDF (`print-artifact-fidelity`), S{n}P{m} anchor changes                            | Composer 2.5       | Sonnet on hard bugs | No                     |
| Standard React / TS implementation, component + Playwright tests                                   | Composer 2.5       | Sonnet after 2 failed attempts or cross-module scope | Optional  |
| Artifact generation (DOCX, PPTX) — `create-final-document-job`, `create-presentation-job`          | Composer 2.5       | —                  | No                      |
| Supabase migrations (`supabase-change`) — non-destructive schema, additive columns                 | Sonnet-class       | Opus if irreversible or data-loss-capable | Yes (Opus reviews diff) |
| RLS policies, auth flows, session / token logic, secrets handling                                  | Sonnet-class       | Opus                | Yes                    |
| Edge Function changes (`run-orchestration-change`)                                                 | Composer 2.5 → Sonnet | Opus if auth / secrets touched | Sometimes    |
| Run dispatch, webhooks, reconciler, cost accounting (`run-orchestration-change`)                   | Sonnet-class       | Opus if concurrency / race conditions | Yes on billing-adjacent |
| Credit ledger, Stripe checkout / webhook, paywall (`billing-and-credits`)                          | Sonnet-class       | Opus                | Yes (always — money-adjacent) |
| Release certification, pre-merge review (`production-readiness`)                                   | Composer 2.5 implements → **Opus reviews** | Opus reviews | Yes (this *is* the review) |
| Cross-repo or architecture-level analysis                                                          | Opus / GPT-5.5     | —                   | n/a                    |
| Cloud Agent dispatch (any surface: automations, GitHub / Slack / Linear @cursor, REST API)         | Curated frontier (Sonnet-class default) — always Max Mode | Opus for high-risk | Yes for high-risk |

Cloud Agents are premium by definition: no Auto option, always Max Mode,
API pricing on every run. Route to them only for work whose value clearly
justifies the run cost. See
[research §10](../../docs/cursor-model-selection-research.md#10-cost-tradeoff-analysis)
for worked cost examples (~$13.20 for a 2M-token Sonnet Cloud Agent run).

## Escalation checklist

Escalate from Composer / Sonnet-class to premium (Opus-class / GPT-5.5)
**only** when at least one objective signal fires. Verbatim from
[research §9](../../docs/cursor-model-selection-research.md#9-escalation-policy):

1. Change spans **> ~5 files** or crosses architectural boundaries
   (frontend + backend + DB in one change).
2. Touches **authentication, authorization, or session / token logic**.
3. Touches **database schema, migrations, or RLS policies** —
   especially **irreversible / data-loss-capable** migrations.
4. **Security-sensitive** code (secrets handling, input validation,
   access control).
5. **Standard model failed ≥ 2 attempts** on the same task (tests still
   red, or reverted work).
6. **Unclear root cause** after one investigation pass.
7. **Concurrency / race conditions** suspected.
8. **Large context genuinely required** — pair with Max Mode.
9. **Multiple external systems** interacting (Supabase + Edge Function +
   third-party API + Lovable handoff).
10. **Ambiguous requirements** that survived a Plan-mode clarification
    pass.
11. **High-cost external workflow** about to run (expensive CI, paid API
    calls, production data touch).
12. **Production incident** triage.
13. **Final release certification** gate.
14. **High financial / reputational impact** change.

If none of the above fire, stay on Composer 2.5. If two or more fire on a
credit-, auth-, or migration-adjacent change, use **cheap-implement +
premium-review** (see below) rather than premium-execute end-to-end.

## De-escalation

Once a premium model has produced a plan, diagnosis, or diff review, hand
the bounded implementation back to Composer 2.5 or Sonnet-class. The
planner / executor split typically costs 20–50 % of an all-premium run and
often produces better code because premium reasoning is spent where it
pays off (planning) instead of where it wastes tokens (mechanical
implementation). See
[research §10](../../docs/cursor-model-selection-research.md#10-cost-tradeoff-analysis).

## Cheap-implement + premium-review (the high-assurance pattern)

Reviewing a diff is input-heavy and output-light; writing a feature is
output-heavy. Output tokens cost ~5× input on every current model.
Therefore, for high-risk work (billing, auth, RLS, migrations, release
certification):

1. Compose or Sonnet writes the change end-to-end. Record the model used.
2. Opus reviews the diff (small input, tiny output) — either in a
   follow-up IDE turn on Opus, via a reviewer subagent in a Cloud Agents
   run (per-subagent `model` field), or via one of the read-only reviewer
   subagents defined in `.cursor/agents/`.
3. Record both models in the WI or PR body (see
   [Recording model and cost](#recording-model-and-cost) below).

The relevant reviewer subagents in this repo:

- `backend-integrity-reviewer` — RLS, idempotency, secret boundaries,
  state-machine invariants, cost accounting.
- `mobile-ux-reviewer` — touch targets, overflow, safe areas, keyboard /
  zoom behavior.
- `print-layout-reviewer` — page geometry, anchor sync, pagination.

Route the reviewer subagent to an Opus-class model when the diff is
billing-, auth-, or migration-adjacent; Sonnet-class otherwise.

## Cloud Agent guardrails

Because Cloud Agents are premium + Max Mode by construction:

- Never dispatch a Cloud Agent for routine work. If the task fits the
  Cheap-fast / General row of the taxonomy, run it interactively on
  Composer 2.5 instead.
- Confirm a spend limit is set on the Cursor account before the first
  Cloud Agent run of the month
  ([CURSOR-CONFIG.md → Recommended settings](../../docs/CURSOR-CONFIG.md#recommended-settings)).
- For high-risk unattended work, use the cheap-implement + premium-review
  pattern with per-subagent `model` fields — plan and review with Opus,
  execute with Composer / Sonnet.

## Recording model and cost

Every task that spent (or committed to spend) real money on the API pool
should be traceable back to a model class and a rough cost.

**In work items** (see
[docs/coordination/README.md → Model and cost fields](../../docs/coordination/README.md#model-and-cost-fields)):
add `model_class` and `estimated_cost_usd` to the frontmatter of new
requests; add a `## Model and Cost` section to the result file when the
work involved paid runs.

**In your final report** (per
[AGENTS.md → Final report contract](../../AGENTS.md#final-report-contract)):
add a `Model class used:` line naming the class and one-line justification.
Omit only when the task was fully advisory / docs-only and no paid runs
occurred.

## Combine with (multi-skill routing)

- Anything credit-, Stripe-, or ledger-adjacent → also apply
  **`billing-and-credits`**. Billing changes always use
  cheap-implement + premium-review.
- Anything reserving credits, dispatching runs, recording costs, or
  handling webhooks → also apply **`run-orchestration-change`**.
- Supabase schema, RLS, Edge Function config → also apply
  **`supabase-change`**.
- Pre-merge / pre-release review → also apply **`production-readiness`**;
  its final review always runs on premium.
- Recording model + cost in a work item, or handing off a Cloud Agent
  run to Lovable → also apply **`multi-agent-coordination`**.

## Procedure

1. Read the affected files. Read
   [docs/cursor-model-selection-research.md](../../docs/cursor-model-selection-research.md)
   if you have not already this session — its §8 routing matrix and §9
   escalation list are the source of truth.
2. Classify the task using the table above. If the task straddles two
   rows, take the higher class.
3. Run the escalation checklist. If any signal fires, escalate to the
   next class up **or** switch to cheap-implement + premium-review.
4. Confirm the model you plan to use is enabled in the account
   ([CURSOR-CONFIG.md → Enabled models](../../docs/CURSOR-CONFIG.md#recommended-settings)).
   If the recommended model has rotated out, pick the current in-product
   equivalent in the same class and log the substitution.
5. For Cloud Agent dispatch, verify a spend limit is set before the first
   run.
6. Execute. If the model fails an attempt, count it against the §9 signal
   5 threshold before retrying at the same class.
7. Record `Model class used` in your final report; record
   `model_class` + `estimated_cost_usd` in the WI frontmatter if the task
   spent real money.

## Validation

This skill has no code-checkable validation. The signals that it was
applied correctly are:

- [ ] Final report contains a `Model class used:` line, or an explicit
      note that the task was advisory / docs-only.
- [ ] Any WI created / updated during the task includes
      `model_class` + `estimated_cost_usd` when applicable.
- [ ] For high-risk changes (billing / auth / RLS / migrations / release),
      a reviewer subagent verdict on the diff is included, produced by a
      premium model.
- [ ] No Cloud Agent run was dispatched without a spend limit in place.

## Failure modes

- Claiming the skill (or a rule, or `AGENTS.md`) "switches the model."
  It does not. The active model was set by the IDE / CLI / SDK / API
  before the skill was read.
- Picking Opus for routine work because "the change is important." If
  none of the §9 signals fire, Composer 2.5 is the right choice.
- Cloud Agent dispatch for tasks that fit Cheap-fast / General — every
  such run pays the frontier-Max-Mode tax for nothing.
- Skipping cheap-implement + premium-review on high-risk work and
  writing the whole feature on Opus. That costs ~3× more than review-only
  for the same assurance level.
- Escalating on the first failed attempt. Signal 5 requires ≥ 2 failures.
- Forgetting to record model + cost on paid runs — the 30-day measurement
  process in `docs/agent-metrics.md` becomes guesswork.
- Selecting a rotated-out model name from the research (e.g. an older
  Sonnet or Opus revision) instead of the current in-product equivalent
  in the same class.

## References

- [docs/cursor-model-selection-research.md](../../docs/cursor-model-selection-research.md)
  — validated policy baseline (authoritative)
- [docs/CURSOR-CONFIG.md](../../docs/CURSOR-CONFIG.md) — the enforcement
  surface (dashboard settings, Custom Modes, spend limits, hook examples,
  substitution log)
- [docs/agent-metrics.md](../../docs/agent-metrics.md) — 30-day
  measurement runbook
- [docs/coordination/README.md](../../docs/coordination/README.md) —
  work-item `model_class` + `estimated_cost_usd` fields
- [AGENTS.md](../../AGENTS.md) — always-apply model rule, router row,
  final report contract
