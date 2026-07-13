# Cursor account configuration runbook

**Purpose.** The enforceable half of the Cursor model-selection and
spend-optimization policy. Everything on this page is applied outside repo
code — in the Cursor IDE Settings, the Cursor dashboard, the Cursor CLI /
SDK / Cloud Agents API, or `.cursor/hooks.json`.

**Companion documents:**

- [docs/cursor-model-selection-research.md](cursor-model-selection-research.md)
  — validated policy baseline (do not re-research).
- [.cursor/skills/model-selection-and-spend/SKILL.md](../.cursor/skills/model-selection-and-spend/SKILL.md)
  — advisory routing skill.
- [docs/agent-metrics.md](agent-metrics.md) — 30-day measurement runbook.

## What repo files can and cannot do

**Cannot.** `.cursor/rules/*.mdc`, `AGENTS.md`, `.cursor/skills/*/SKILL.md`
never switch the active model. They are context injected into whichever
model the IDE / CLI / SDK / Cloud Agents API is already running. Cursor's
own Enterprise LLM-safety documentation classifies Rules and Commands as
"LLM steering (non-deterministic guidance)."

**Can.** Documented in this repo, in one place only:

- `.cursor/hooks.json` — `beforeSubmitPrompt` can `deny` or `ask` a prompt
  (not implemented in this repo; see
  [Optional guardrail hook](#optional-guardrail-hook)).
- Custom Modes (beta) — configured in the IDE, not the repo, but the
  instructions inside a Custom Mode can be committed alongside the repo if
  Cursor exposes them.

Every other enforceable control lives in one of the surfaces listed below.

## Enforceable control surfaces

| Surface                                            | Enforces                                          | Where to change it                                                     |
| -------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| IDE Settings → Models                              | Enabled models; global default                    | Cursor IDE → Settings → Models                                         |
| Team default model + model blocklist               | Team-wide default; hide never-used models         | `cursor.com/dashboard` → Team settings (Teams / Enterprise)            |
| Team spend limit + soft-limit alerts (50/80/100 %) | Monthly cap; user + admin notifications           | `cursor.com/dashboard/spending`                                        |
| Cloud Agent default model + Max Mode               | Which model is used for unattended runs          | `cursor.com/dashboard` → Cloud Agents settings                         |
| Cloud Agent per-run `model` field                  | Overrides default per run                         | `POST /v1/agents` `model` object; SDK `Agent.create({ model })`        |
| Cursor CLI `-m` / `--model` / `/model`             | Per-invocation model                              | `cursor-agent --model <id>` or `/model` in session                     |
| CLI `cli-config.json`                              | Global CLI default                                | `~/.cursor/cli-config.json` (user-scoped)                              |
| SDK `Agent.create({ model: { id, params } })`      | Per-run model + params                            | TypeScript / Python SDK                                                |
| Per-subagent `model` in a Cloud Agents run         | Bind different models to plan / execute / review  | Cloud Agents subagent config                                           |
| Custom Modes (beta)                                | Named preset combining model + tools + prompt     | Cursor IDE → Custom Modes                                              |
| `.cursor/hooks.json` `beforeSubmitPrompt`          | Guardrail (`deny` / `ask`); cannot switch model   | This repo (not currently used)                                         |
| Per-user spend limit                               | Hard per-user cap                                 | Cursor Enterprise dashboard (Teams does not expose this)              |

## Environment-specific facts to record

The following facts vary by account and installation. This VM has no Cursor
CLI installed, so the observable half of the checklist is empty here — fill
these in from your local machine and the Cursor dashboard, then commit the
updated table.

### Cursor product / installation

| Fact                                | Value                                    | How to check                                             |
| ----------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Current Cursor IDE version          | _(fill in)_                              | Cursor → About                                           |
| Current Cursor CLI version          | _(fill in — not installed on Cloud VM)_  | `cursor-agent --version` locally                         |
| Current default model (IDE)         | _(fill in)_                              | Settings → Models → default dropdown                     |
| Current default model (CLI)         | _(fill in)_                              | `~/.cursor/cli-config.json` `model` field                |
| Current default model (Cloud Agent) | _(fill in)_                              | `cursor.com/dashboard` → Cloud Agents settings           |
| Whether Custom Modes are enabled    | _(fill in — beta gate)_                  | Settings → Custom Modes (visible if enabled)             |

### Account / plan

| Fact                                          | Value       | How to check                                        |
| --------------------------------------------- | ----------- | --------------------------------------------------- |
| Plan tier                                     | _(fill in)_ | `cursor.com/dashboard` → Billing                    |
| Admin permissions (team admin? enterprise?)   | _(fill in)_ | `cursor.com/dashboard` → Team members               |
| On-demand usage enabled?                      | _(fill in)_ | `cursor.com/dashboard/spending` → On-demand toggle  |
| Team spend limit (monthly cap)                | _(fill in)_ | `cursor.com/dashboard/spending`                     |
| Soft alerts configured (50 / 80 / 100 %)      | _(fill in)_ | `cursor.com/dashboard/spending`                     |
| Cloud Agent spend limit                       | _(fill in)_ | Prompted on first Cloud Agent run                   |
| Cursor Token Rate applies? (Teams/Enterprise) | _(fill in)_ | Plan-derived; verify per help/token-rate            |

### Enabled models (in the account)

The recommended set from research §13 is: **Composer 2.5, Sonnet-class,
Opus-class enabled; everything else disabled.** Record the current state
and any deltas.

| Recommended model    | Enabled in this account? | Substituted with (if rotated out) | Verified on |
| -------------------- | ------------------------ | --------------------------------- | ----------- |
| Composer 2.5         | _(fill in)_              | —                                 | _(YYYY-MM-DD)_ |
| Claude Sonnet 4.6    | _(fill in)_              | _(e.g. Sonnet 5 if rotated in)_   | _(YYYY-MM-DD)_ |
| Claude Opus 4.8      | _(fill in)_              | _(e.g. Opus 4.9 if rotated in)_   | _(YYYY-MM-DD)_ |

### Cloud Agents

| Fact                                                       | Value       | How to check                                     |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------ |
| Cloud Agent default model                                  | _(fill in)_ | Cloud Agents settings                            |
| Max Mode                                                   | Always on (forced by Cursor for Cloud Agents) | Documented; no toggle |
| Long-running agents enabled?                               | _(fill in)_ | Cloud Agents team settings                      |
| Model IDs exposed by `GET /v1/models` on this account      | _(fill in)_ | `curl -H "Authorization: Bearer $CURSOR_API_KEY" https://api.cursor.com/v1/models` |

## Recommended settings

Start from research §13 (single developer) or §14 (team) and record any
substitutions in the [substitution log](#model-substitution-log).

### IDE (all plans)

- **Settings → Models — enabled list:** Composer 2.5, Sonnet-class,
  Opus-class. Disable the rest to declutter.
- **Settings → Models — default:** Composer 2.5 (or Auto on Teams for the
  Cursor-Token-Rate exemption).
- **Settings — "always show usage summary":** on.
- **Model dropdown Max Mode toggle:** off by default. Turn on only for
  tasks with a documented large-context need. Cloud Agents force it on
  regardless.

### Team dashboard (Teams / Enterprise)

- **Team default model:** Composer 2.5 or Auto.
- **Team model blocklist:** hide models the team never uses (starts with
  older Composers, Fable 5, and Fast-mode Opus variants).
- **Spend limit:** set a monthly cap sized to the team's plan.
- **Soft alerts:** enable at 50 / 80 / 100 %.
- **Cloud Agent default model:** Sonnet-class (must support Max Mode).
- **Per-user spend limit:** Enterprise only. On Teams, rely on soft alerts
  plus Premium-seat isolation for heavy users.

### CLI (`~/.cursor/cli-config.json`)

- `model` — Composer 2.5. Override per invocation with `-m`.
- `-m auto` — verify against your CLI version; recent versions may reject
  bare `auto` on some plans (see research §19).

### Cloud Agents API / SDK

- Always set an explicit `model` on `POST /v1/agents` when the task is not
  routine, so the default doesn't silently escalate.
- Use per-subagent `model` fields for planner / executor / reviewer splits.
- Confirm a spend limit is set on the account before the first run.

## Cloud Agent workflow configuration for this repo

Cursor does not expose "named Cloud Agent products with bound models" as a
first-class concept. The four specialization mechanisms are:

| Mechanism                                     | What it configures                                                | When to reach for it                                          | Used in this repo today? |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| Per-dispatch `model` on `POST /v0/agents`     | The model on a single Cloud Agent run                             | Any programmatic dispatch, including this repo's edge functions | Yes (via `AGENT_MODEL` env var — global, not per-workflow) |
| Per-subagent `model` inside a run (SDK / v1 API only) | Different models on planner / executor / reviewer sub-tasks | Cheap-implement + premium-review pattern in unattended runs   | No — v0 does not expose subagents; requires dispatch migration to v1 or the SDK |
| Automations                                   | A named schedule / trigger + model + tools + prompt on the account | Recurring or event-triggered runs; the closest thing to a "named workflow Cloud Agent" | No |
| Custom Modes (beta)                           | IDE-side preset (model + tools + instructions)                    | Interactive human turns, not Cloud Agent runs                 | No                       |

### Workflows this repo dispatches to Cursor

Enumerated by `agent_runs.kind`. The two research kinds go to Parallel AI
and are out of scope for Cursor model selection.

| Kind          | Dispatched by                                                                                                      | What the Cloud Agent does           | Recommended model class          |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------- |
| `packet`      | `supabase/functions/start-workflow/index.ts` → `_shared/dispatch.ts` → `_shared/provider.cursor.ts` `POST /v0/agents` | Compose the research packet         | High-intelligence (Sonnet-class) |
| `final_docx`  | `supabase/functions/create-final-document-job/index.ts` → same dispatch path                                       | Generate DOCX artifact              | High-intelligence (Sonnet-class), tight spend limit |
| `final_pptx`  | `supabase/functions/create-presentation-job/index.ts` → same dispatch path                                         | Generate PPTX artifact              | High-intelligence (Sonnet-class), tight spend limit |
| `research`    | `supabase/functions/start-workflow` (Parallel AI provider)                                                         | Deep research task                  | Not applicable (Parallel model, not Cursor) |
| `followup_research` | `supabase/functions/run-follow-up-research/index.ts` (Parallel AI)                                           | Follow-up research task             | Not applicable (Parallel model, not Cursor) |

### Current dispatch reads one env var

`supabase/functions/_shared/dispatch.ts` line 73:

```
model: Deno.env.get("AGENT_MODEL") ?? undefined,
```

Every Cursor dispatch resolves to the same `AGENT_MODEL`. This is
functional but not optimal — the three workflows above have different cost
sensitivities but currently share a model. Set `AGENT_MODEL` to a
Sonnet-class model ID exposed by your account (see the substitution log
below). If left unset, the Cursor account's user default → team default →
system default resolves it, and that default is where you land — the repo
does not force a choice.

### Specializing per workflow (out of scope for this pass)

To make the model per-workflow instead of global, the smallest change is
to thread `run.kind` into `dispatch.ts`'s model resolution. Two shapes
work:

- **Per-`kind` env vars.** Read `AGENT_MODEL_PACKET`, `AGENT_MODEL_FINAL_DOCX`,
  `AGENT_MODEL_FINAL_PPTX`, falling back to `AGENT_MODEL`, then to
  `undefined` (account default). ~15 lines in `dispatch.ts`, one line in
  `docs/CONFIGURATION.md`, secret setup as a Lovable-side action.
- **Static map in `dispatch.ts`.** A `KIND_MODEL: Record<RunKind, string>`
  constant hard-coded in the file, overridable by env var. Cheaper to
  deploy (no new secrets) but less operable — every model change requires
  a code push.

Either shape belongs behind its own work item. Not part of this policy
pass.

### Per-subagent split (out of scope for this pass — ordered follow-ups)

The `packet` workflow is the natural fit for a planner (Opus) → executor
(Sonnet) → reviewer (Opus) subagent split — most of the reasoning value is
in the plan, most of the output tokens are in the compose. This is
**not** a prompt-engineering task. Writing "act as planner then executor"
in a single prompt runs the whole thing on one model. Per-subagent
`model` is a first-class configuration surface that only exists on the
Cloud Agents SDK and the v1 REST API.

Two ordered follow-ups are required. Do the migration first; the subagent
work depends on it.

**Follow-up 1: v0 → v1 (or SDK) dispatch migration.** This repo currently
dispatches on `/v0/agents` (`supabase/functions/_shared/provider.cursor.ts`
line 12: `const BASE_URL = "https://api.cursor.com"; ... "/v0/agents"`).
v0 does not expose subagents. The `docs/cursor-api-research.md` file
notes that the v1 endpoint schemas were "not established" in retrievable
first-party content at the time of that research; that gap has to close
before code is written. Approximate scope:

- Live probe of the account: `GET /v1/models` and a minimal `POST /v1/agents`
  call to confirm the schema and the subagent shape on this account.
- New `provider.cursor.v1.ts` or a version parameter on `CursorProvider`.
- Update `dispatch.ts` to select the transport (fallback to v0 for
  compatibility during rollout).
- Update `cursor-webhook` and `reconcile-runs` for any v1 status/event
  differences (v1 introduces run IDs vs v0's single agent ID; this repo
  already reserves `external_run_id` for it).
- Lovable-side redeploy.

Sized as: medium — new provider file (~100 lines), dispatch and
reconciler updates, webhook handling, live-probe verification, plus one
work item to Lovable for the deploy.

**Follow-up 2: subagent split on the migrated transport.** Once v1 / SDK
dispatch is live, add the planner / executor / reviewer subagent config
to the create-agent payload for the `packet` workflow. Approximate scope:

- Prompt-template changes to bound each sub-task (planner produces a
  plan; executor consumes plan and produces the packet; reviewer consumes
  the diff and produces a verdict).
- `dispatch.ts` extension to emit the subagent config with per-subagent
  `model` fields.
- Reconciler awareness of `subagentStart` / subagent completion events
  (per the research §6 hook payload).
- Cost projection review before enabling: per-run cost may go up in
  exchange for reduced retry cost — worth measuring 30 days per
  `docs/agent-metrics.md` before generalising to `final_docx` / `final_pptx`.

Sized as: medium — depends entirely on the shape of Follow-up 1. Do not
start until Follow-up 1 has produced verified live evidence of the v1
subagent schema.

### Automations (not currently used)

Automations persist their own trigger + model + tools + prompt on the
Cursor dashboard, and are the right home for any scheduled / recurring
Cloud Agent workflow (e.g. a nightly release-certification pass). This
repo has no scheduled Cloud Agent workflows today. If one is added, an
Automation with its own explicit `model` is the correct configuration
site — not a repo env var.

### Custom Modes (IDE only)

The instructions inside a Custom Mode can live in the repo (Cursor
exposes an export path), but the model binding itself is a per-user
preference set in the IDE. Useful for interactive workflows: a
"Deep-Reasoning" preset (Opus, no auto-run, plan-mode default) and a
"Certification" preset (Opus, review-oriented prompt) are the two
research recommends. Not applicable to Cloud Agent dispatch.

## Cloud Agents caveats

- **Always premium + Max Mode.** No Auto option. Every run bills at
  provider API pricing.
- **No native retry limit.** A failed premium run is not refunded. Cap
  retries externally per the escalation checklist (skill §Escalation).
- **Ask-for-spend-limit on first use.** Set it before dispatching real
  work.
- **Webhooks for v1 API were "coming soon"** as of the last research
  snapshot — verify current status in the Cursor changelog before relying
  on push notifications.
- **Never route routine work here.** If the task fits Cheap-fast / General
  in the skill's task taxonomy, run it interactively on Composer 2.5 in
  the IDE instead.

## Optional guardrail hook

Not currently installed in this repo. A minimal `.cursor/hooks.json`
`beforeSubmitPrompt` guardrail could be added later to prompt for
confirmation when a premium model is invoked without an escalation label
in the prompt. Documented here so the shape is agreed if we decide to
enable it:

```json
{
  "beforeSubmitPrompt": [
    {
      "match": { "modelClass": "premium" },
      "unless": { "promptContains": ["#escalate", "#certification", "#review"] },
      "action": "ask",
      "message": "Premium model selected but no escalation label found. Confirm this matches an escalation signal in .cursor/skills/model-selection-and-spend/SKILL.md."
    }
  ]
}
```

Fields shown are illustrative — verify against the current `.cursor/hooks.json`
schema before enabling. The hook cannot switch the model; it can only
`deny` or `ask` on prompt submission. That is the guarantee the skill and
this runbook rely on.

## Model substitution log

Recommended models rotate. When a recommended model is not available in
this account, substitute the current in-product equivalent in the same
class and record the substitution here.

| Date       | Class             | Recommended        | Substituted with | Reason                    | Recorded by |
| ---------- | ----------------- | ------------------ | ---------------- | ------------------------- | ----------- |
| _(none yet — add rows as substitutions occur)_ | | | | | |

## Verification cadence

- **On any policy edit** (this file, the skill, the research doc, the
  metrics runbook): re-check that recommended models are still in the
  enabled list and that spend limits are still in force.
- **Monthly:** re-run the environment-facts checklist above. Prices and
  the model roster rotate; the research doc is a snapshot.
- **Before dispatching a Cloud Agent** for the first time in a calendar
  month: confirm the spend limit is set and the Cloud Agent default
  matches the recommended class.
