# Cursor Agent Model Selection and Spend Optimization

**Status:** validated 2026-07-13. Treat as authoritative input; do not
re-research or challenge its conclusions.

**Snapshot date:** 2026-07-13. Provider list prices and Cursor's model roster
rotate frequently. Verify environment-specific facts (which models are enabled
in this Cursor account, exact model IDs exposed by the installed CLI/SDK/Cloud
Agents API, current default, plan, spend limits, Cloud Agent configuration)
against [CURSOR-CONFIG.md](CURSOR-CONFIG.md) — this document is the policy
baseline, that document is the current environment.

**Model substitution rule:** when a recommended model has rotated out of the
Cursor roster, select its current in-product equivalent in the same model
class and record the substitution in
[CURSOR-CONFIG.md](CURSOR-CONFIG.md#model-substitution-log).

**Referenced by:** [AGENTS.md](../AGENTS.md),
[.cursor/skills/model-selection-and-spend/SKILL.md](../.cursor/skills/model-selection-and-spend/SKILL.md),
[CURSOR-CONFIG.md](CURSOR-CONFIG.md),
[agent-metrics.md](agent-metrics.md).

---

## 1. Executive Findings

**Bottom line: Your workflow is almost certainly overspending, and the single highest-leverage fix is to make Cursor's Auto/Composer pool the default for routine work while reserving explicit frontier-model selection (Sonnet-class) and Cloud Agents (which are always premium + Max Mode) for a small minority of genuinely hard or high-risk tasks.** Cursor gives you real, documented model-selection control at the point of use (IDE dropdown, CLI `--model`, API/SDK `model.id`), plus team-level defaults, blocklists, and spend limits — but it does **not** let a repository skill, rule, or AGENTS.md file choose the model. Routing is therefore a matter of human discipline plus a thin external script layer, not a repo config file.

Key strategic conclusions:

- **Two billing pools drive everything.** Auto + Composer 2.5 draw from a cheap, "generously included" pool; every explicitly-selected frontier model (Claude, GPT, Gemini, Grok) is metered from a separate API pool at that provider's list token price. Cursor's launch blog (cursor.com/blog/composer-2) states Composer 2.5 is "priced at $0.50/M input and $2.50/M output tokens, making it a new, optimal combination of intelligence and cost" — roughly 6× cheaper on both input and output than Claude Sonnet ($3/$15, per Anthropic official pricing verified July 12, 2026), and ~10× cheaper than Opus-class ($5/$25). The cheap default is not a compromise: on Cursor's own May 18, 2026 launch data, Composer 2.5 scores **63.2% on CursorBench v3.1** (vs Claude Opus 4.7's 61.6% default / 64.8% max and GPT-5.5's 59.2%), **79.8% on SWE-Bench Multilingual** (vs Opus 4.7's 80.5%), and **69.3% on Terminal-Bench 2.0** (vs Opus 4.7's 69.4%) — i.e., competitive with frontier models on everyday coding at one-tenth the token cost.
- **Cloud Agents are structurally expensive.** Per cursor.com/docs/cloud-agent, they "use a curated selection of models that always run in Max Mode. There is no toggle to turn Max Mode off for Cloud Agents," and "Cloud Agents are charged at API pricing for the selected model. You'll be asked to set a spend limit when you first start using them." There is no Auto option. Treat Cloud Agents as a premium surface by definition — never a routine one.
- **Model choice cannot be embedded in repo files.** Rules, Skills, and AGENTS.md are model-agnostic context injectors. The only durable, machine-enforceable model binding lives in: the IDE default, the team default, the CLI/SDK/API `model` field, and per-subagent `model` fields.
- **The premium-review pattern beats premium-execution.** Because output tokens cost ~5× input tokens on every current-generation model, letting a cheap model write code and a premium model *review the diff* (small input, tiny output) is dramatically cheaper than having the premium model write everything, and captures most of the quality benefit.

## 2. Verified Cursor Capabilities

All claims below are from official Cursor documentation (cursor.com/docs, /help, /changelog, /blog) as of July 13, 2026, unless labelled otherwise.

**Model selection at point of use — VERIFIED:**

- **IDE (Agent / Ask / Custom modes):** A model dropdown under the chat input lists models enabled in Settings → Models. Auto-select lets Cursor pick "the premium model best fit for the immediate task."  Models are added/removed frequently; the dropdown is the source of truth.
- **CLI:** `cursor-agent` (also invoked as `agent`) exposes `-m/--model` and an in-session `/model` slash command; e.g. `cursor agent -p "fix test" --model gpt-5.2`.  `agent models` lists available models.  Config lives in `cli-config.json` (only permissions are project-scoped; everything else is global).
- **SDK (TypeScript `@cursor/sdk`, Python `cursor_sdk`):** `Agent.create({ model: { id: "composer-2.5", params: [...] } })`. `Cursor.models.list()` discovers valid IDs and per-model parameters (reasoning effort, `fast`, max mode). Public beta.
- **Cloud Agents REST API (`POST /v1/agents`, public beta):** Optional `model` object with `id` (from `GET /v1/models`, e.g. `claude-4-sonnet-thinking`)  and `params`. Omitting it resolves user default → team default → system default.

**Modes — VERIFIED:** Agent (autonomous multi-file), Ask (read-only Q&A), Plan (researches codebase, asks clarifying questions, emits an editable Markdown plan saved to `.cursor/plans/`), and Custom modes (beta; custom tool combos + instructions). Plan mode can hand plans off to Cloud for implementation.

**Parallelism — VERIFIED:** Multiple agents run in parallel, each in its own git worktree. Cursor's "Best practices for coding with agents" (cursor.com/blog/agent-best-practices) states: "We've found that having multiple models attempt the same problem and picking the best result significantly improves the final output, especially for harder tasks." (The `/best-of-n` CLI command implements this pattern.)

**Not supported / unverified (flag honestly):**

- **No per-mode default model.** There is an open feature request for "Default Model Selection Per Mode (Agent/Ask/Plan/Debug)"  — i.e. it does not exist today.
- **No model selection embedded in Rules/Skills/AGENTS.md** (see §6).
- **No hard per-user spend cap on Teams** (only Enterprise); Teams caps are team-wide (see §17).
- **Auto is not available for Cloud Agents** (community-reported 400 "Model 'Auto' is not available or invalid"; consistent with docs stating Cloud Agents use a curated Max-Mode model set).

## 3. Model Availability

The following is the current Cursor-exposed roster from the official **Models & Pricing** doc (cursor.com/docs/models-and-pricing) and the Teams pricing doc. Prices are per **1M tokens**, sourced by Cursor from each provider's API pricing.  "Hidden by default" means you must enable it in Settings → Models. This roster changes frequently; verify in-product before hardcoding.

**Cursor first-party (Auto + Composer pool):**

| Model        | Input                     | Cache read | Output | Notes                                                                                               |
| ------------ | ------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| Composer 2.5 | $0.50                     | $0.20      | $2.50  | Cursor's own agentic coding model; the low-cost daily driver; Fast variant $3.00/$15.00; not hidden |
| Composer 2   | $0.50                     | $0.20      | $2.50  | Hidden/retired; SDK reroutes `composer-2` to 2.5                                                    |
| Composer 1.5 | $3.50                     | $0.35      | $17.50 | Hidden by default                                                                                   |
| Composer 1   | $1.25                     | $0.125     | $10    | Hidden by default                                                                                   |
| **Auto**     | $1.25 (input+cache write) | $0.25      | $6.00  | Cursor selects a cost-efficient model; draws from the cheap pool                                    |

**Anthropic (API pool):** Claude 4.5 Haiku $1/$5; Claude 4/4.5/4.6/4.7 Sonnet $3/$15 (Sonnet 1M $6/$22.5, 2× above 200K input); Claude 4.5/4.6/4.7 Opus $5/$25; Claude Opus 4.8 $5/$25 (fast mode `claude-opus-4-8-fast` 3× cheaper than Opus 4.7 fast);  Opus fast-mode variants $30/$150; Claude Fable 5 $10/$50 (auto-routes guardrail trips to Opus).  *(Provider note, labelled: Anthropic launched Claude Sonnet 5 on June 30, 2026 at introductory $2/$10 through Aug 31, reverting to $3/$15 on Sept 1; confirm whether Cursor has added Sonnet 5 to its roster.)*

**OpenAI (API pool):** GPT-5 $1.25/$10 (Fast $2.5/$20); GPT-5 Mini $0.25/$2; GPT-5-Codex / 5.1 Codex / 5.1 Codex Max $1.25/$10; GPT-5.1 Codex Mini $0.25/$2; GPT-5.2 / 5.2 Codex / 5.3 Codex $1.75/$14; GPT-5.4 $2.5/$15 (90% cached-input discount); GPT-5.4 Mini $0.75/$4.5; GPT-5.4 Nano $0.2/$1.25; GPT-5.5 $5/$30.

**Google (API pool):** Gemini 2.5 Flash $0.3/$2.5; Gemini 3 Flash $0.5/$3; Gemini 3.5 Flash $1.5/$9; Gemini 3 Pro / 3.1 Pro $2/$12; Gemini 3 Pro Image Preview $2/$12 + image output $120/M.

**xAI (API pool):** Grok 4.20 $2/$6 (2× above 200K input); Grok 4.3 $1.25/$2.5; Grok Build 0.1 $1/$2.

**Moonshot:** Kimi K2.5 $0.6/$3 (hidden by default).

**Max Mode:** extends context to the model's maximum (up to 1M for several models); token-billed at the model's API rate, so it consumes usage faster.  Cloud Agents always run in Max Mode.

## 4. Billing and Usage Model

**Two pools, reset monthly (VERIFIED, cursor.com/docs/models-and-pricing):**

- **Auto + Composer pool** — "significantly more included usage" when Auto or Composer 2.5 is selected. Designed for everyday agentic coding at lower cost.
- **API pool** — billed at each model's list API price when you select a specific model or use Premium routing. Included: **Pro $20/mo, Pro+ $70/mo, Ultra $400/mo** of API usage.

**Plans (individual):** Pro $20/mo, Pro+ $60/mo, Ultra $200/mo. All include unlimited Tab, extended agent limits on all models, Bugbot, and Cloud Agents. Cursor's own guidance: daily Tab users stay within $20; daily Agent users typically $60–$100/mo total; power users (multiple agents/automation) often $200+/mo.

**Teams:** Standard seat $40/user/mo (includes $20/user/mo usage, non-transferable, resets monthly);  Premium seat $120/user/mo (5× Standard agent limits).  On-demand enabled by default.  Enterprise = pooled usage, custom.

**Cursor Token Rate (Teams/Enterprise, VERIFIED):** the Cursor Token Rate help page states Teams and Enterprise customers "pay a Cursor Token Rate of $0.25 per million tokens only on non-Auto, third-party model requests. Auto requests and all first-party models, including Composer 2.5 and Grok 4.5, are exempt," and "the rate applies to input tokens, output tokens, and cached tokens" (including BYOK). *(Note a phrasing discrepancy: the Teams pricing doc describes it more broadly as applying to "all non-Auto agent requests"; the dedicated token-rate page is the more specific source and exempts first-party Composer.)* Either way, keeping routine work on Auto/Composer avoids this surcharge entirely — a direct financial incentive.

**On-demand / overages:** Once included usage is exhausted, on-demand billing continues at the same API rates (no markup); requests "are never downgraded in quality or speed."  Must be explicitly enabled for individuals; on by default for Teams.

**Cloud Agents billing (VERIFIED):** charged at API pricing for the selected model;  always Max Mode; you're prompted to set a spend limit on first use.

**Usage visibility (VERIFIED):** Editor settings + `cursor.com/dashboard/usage` show both pools and per-request cost + model.  The May 4, 2026 changelog added: filter usage by user and by product surface (clients, Cloud Agents, automations, Bugbot, Security Review). Teams/Enterprise get an Admin Dashboard and Admin API (spending-data endpoint); Enterprise adds an AI Code Tracking API with CSV export (paged, 10,000 records) and audit logs.

**Inference (labelled): downloadable per-request records** exist via the dashboard and Admin API; a fully public per-request cost export API is Enterprise-tier. Webhooks for Cloud Agents were "coming soon" as of the v1 API beta (legacy v0 had them).

## 5. Model-Selection Controls by Surface

| Surface                     | Pick specific model          | Set default                       | Override per task    | Auto routing                                                         | Restrict models                  | Spend cap                          | Effort/reasoning                 | Change mid-task                   |
| --------------------------- | ---------------------------- | --------------------------------- | -------------------- | -------------------------------------------------------------------- | -------------------------------- | ---------------------------------- | -------------------------------- | --------------------------------- |
| IDE Agent/Ask               | Yes (dropdown)               | Global default only (no per-mode) | Yes                  | Yes (Auto)                                                           | Team/Enterprise blocklist        | Team/Enterprise                    | Thinking toggle; effort variants | Yes (switch dropdown; new turns)  |
| Custom modes (beta)         | Yes                          | Per custom mode you build         | Yes                  | Yes                                                                  | Same                             | Same                               | Yes                              | Yes                               |
| CLI                         | Yes (`-m`/`/model`)          | Global via config                 | Yes (per invocation) | Historically yes; recent versions may reject bare `auto` (community) | Inherits account                 | Inherits                           | Yes (params)                     | `/model` in session               |
| SDK                         | Yes (`model.id`)             | Code-controlled                   | Yes                  | Composer/explicit                                                    | Account-limited                  | Account                            | Yes (`params`)                   | New agent per run                 |
| Cloud Agents (UI/API)       | Yes (curated frontier only)  | User→team→system default          | Yes (`model` field)  | **No Auto**                                                          | Team default must be Max-capable | Prompted on first use; team limits | Yes (`params`)                   | Follow-up runs; new model per run |
| Automations                 | Yes (choose model in config) | Per automation                    | Per automation       | No                                                                   | Team                             | Team                               | Yes                              | Per run                           |
| GitHub/Slack/Linear @cursor | Uses configured default      | User/team default                 | Limited              | No                                                                   | Team                             | Team                               | Limited                          | Follow-ups                        |

**Escalation during a task:** There is no in-place "upgrade this running agent to Opus" button. Practical escalation = start a new agent/turn on the higher model (optionally handing off the Plan-mode Markdown plan). Subagents can be assigned a higher model via the API `model` field (see §6/§11).

## 6. Skills, Rules, and Agent Profiles

**VERIFIED — repository files cannot select the model:**

- **Rules** (`.cursor/rules/*.mdc`) inject context "at the start of the model context."  Frontmatter supports only `description`, `globs`, `alwaysApply` — there is no model field. Rules are model-agnostic ("The rules are injected as system-level context regardless of which model you've selected"). Precedence: Team → Project → User.
- **AGENTS.md** is "a plain markdown file without metadata or complex configurations."  No model binding.
- **Skills** (`SKILL.md`) are portable instruction/executable packages loaded by relevance; imported Claude skills are treated as "agent-decided rules."  No model field.
- **Enterprise LLM-safety doc** explicitly classifies Rules/Commands as "LLM steering (non-deterministic guidance)… shaping its context and available actions"  — i.e. guidance, not control.

**The one nuance — Hooks:** `.cursor/hooks.json` supports **prompt-based hooks** with an optional `model` field, but that sets the model for the *hook's own fast LLM evaluation* of a policy condition — **not** the main agent's model. The `beforeSubmitPrompt` hook receives the prompt and can `deny`/`ask`, so it can *block* a prompt and instruct the user to switch models, but it cannot silently reassign the agent's model. (A feature request to expose the selected model name in `beforeSubmitPrompt`  confirms this gap.) Cloud Agents run project hooks from `.cursor/hooks.json`; Enterprise adds team/enterprise-managed hooks.

**The one place model binding IS in config — subagents:** In the Cloud Agents API/SDK, custom subagents accept an optional `model` (model ID string, `ModelSelection` object, or `"inherit"`). The `subagentStart` hook payload includes `subagent_model`. This is the only documented way to bind different models to different sub-tasks within one run.

**Closest supported alternative to "skill picks model":** (1) team/user **default model** set to Composer 2.5/Auto; (2) named **Custom modes** (beta) each pre-wired to a model + tool set + instructions; (3) an **external routing script** (CLI/SDK) that reads a task label and sets `--model` (see §10/§15).

## 7. Task Complexity Taxonomy

Model classes: **Cheap-fast** = Composer 2.5 / Auto / Haiku-class / Gemini Flash. **General coding** = Composer 2.5 / Auto (default). **High-intelligence** = Claude Sonnet-class / GPT-5.2–5.4 / Gemini 3 Pro. **Premium reasoning** = Claude Opus-class / GPT-5.5 / Fable 5.

| Task                                       | Min viable       | Preferred                  | Escalation                          | Premium justified? | Waste if overpowered |
| ------------------------------------------ | ---------------- | -------------------------- | ----------------------------------- | ------------------ | -------------------- |
| Doc edits, copy changes                    | Cheap-fast       | Composer 2.5/Auto          | —                                   | No                 | High                 |
| File moves/renames, formatting, lint fixes | Cheap-fast       | Composer 2.5/Auto          | —                                   | No                 | High                 |
| Small UI changes                           | Cheap-fast       | Composer 2.5/Auto          | Sonnet if design-sensitive          | No                 | Moderate             |
| Test fixtures, unit tests                  | Cheap-fast       | Composer 2.5               | Sonnet on repeated failure          | No                 | Moderate             |
| Component tests, Playwright E2E            | General          | Composer 2.5               | Sonnet on flaky/complex flows       | Rarely             | Moderate             |
| Straightforward bug fixes                  | General          | Composer 2.5/Auto          | Sonnet after 2 failures             | No                 | Moderate             |
| Repo search, dependency inspection         | Cheap-fast       | Composer 2.5/Auto (Ask)    | —                                   | No                 | High                 |
| TypeScript refactors (local)               | General          | Composer 2.5               | Sonnet if cross-module              | Sometimes          | Moderate             |
| React state changes                        | General          | Composer 2.5               | Sonnet if cross-cutting             | No                 | Moderate             |
| Supabase migration authoring               | High-intel       | Sonnet-class               | Opus if irreversible/data-loss risk | Often              | Low                  |
| Edge Function changes                      | General→High     | Composer 2.5 → Sonnet      | Opus if auth/secrets involved       | Sometimes          | Low                  |
| Authentication changes                     | High-intel       | Sonnet-class               | Opus                                | Yes                | Low                  |
| RLS-policy reasoning                       | High-intel       | Sonnet-class               | Opus                                | Yes                | Low                  |
| Cost instrumentation                       | General          | Composer 2.5               | Sonnet                              | No                 | Moderate             |
| Long-running workflow debugging            | High-intel       | Sonnet-class               | Opus/GPT-5.5                        | Often              | Low                  |
| Race-condition / concurrency analysis      | Premium          | Opus-class / GPT-5.5       | —                                   | Yes                | Low                  |
| Architecture review                        | Premium          | Opus-class                 | —                                   | Yes                | Low                  |
| Cross-repo analysis                        | High→Premium     | Sonnet (Max) → Opus        | Opus                                | Often              | Low                  |
| Large refactors                            | High-intel       | Sonnet-class (Max)         | Opus                                | Sometimes          | Moderate             |
| Complex root-cause analysis                | Premium          | Opus-class                 | —                                   | Yes                | Low                  |
| Security review                            | Premium          | Opus-class (review only)   | —                                   | Yes                | Low                  |
| Data migration planning                    | Premium          | Opus-class                 | —                                   | Yes                | Low                  |
| DOCX generation                            | Cheap-fast       | Composer 2.5               | —                                   | No                 | High                 |
| PowerPoint generation                      | Cheap-fast       | Composer 2.5               | —                                   | No                 | High                 |
| Print-layout review                        | General          | Composer 2.5/Sonnet        | —                                   | No                 | Moderate             |
| Accessibility review                       | General→High     | Composer 2.5 → Sonnet      | —                                   | Sometimes          | Moderate             |
| Final release certification                | Premium (review) | Opus-class reviewing diffs | —                                   | Yes                | Low                  |

**Key principle:** premium **review** is almost always more cost-effective than premium **execution** because review is input-heavy and output-light, and output tokens cost ~5× input.

## 8. Model Routing Matrix

Default model = **Composer 2.5** (IDE) / Composer 2.5 or Auto for routine. Escalation model tiers named with current verified models.

| Task class                                                             | Default model                                             | Escalation model  | Escalation trigger                       | Premium review required | Expected frequency | Cost sensitivity |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------- | ---------------------------------------- | ----------------------- | ------------------ | ---------------- |
| Routine edits (docs, lint, format, copy, file moves)                   | Composer 2.5 / Auto                                       | —                 | none                                     | No                      | ~40% of tasks      | Low              |
| Standard implementation (React/TS, small features, unit/E2E tests)     | Composer 2.5                                              | Claude Sonnet 4.6 | 2 failed attempts, or cross-module scope | Optional                | ~35%               | Medium           |
| Backend/data (Supabase migrations, Edge Functions)                     | Claude Sonnet 4.6                                         | Claude Opus 4.8   | irreversible migration, RLS/auth touched | Yes (Opus reviews diff) | ~12%               | High             |
| Security / auth / RLS                                                  | Claude Sonnet 4.6                                         | Claude Opus 4.8   | any auth/authz/secret logic              | Yes                     | ~5%                | High             |
| Deep reasoning (race conditions, architecture, root cause, cross-repo) | Claude Opus 4.8 / GPT-5.5                                 | —                 | complexity signal met (§9)               | n/a                     | ~5%                | High             |
| Artifact generation (DOCX/PPTX)                                        | Composer 2.5                                              | —                 | none                                     | No                      | ~2%                | Low              |
| Release certification                                                  | Composer 2.5 implements → Opus 4.8 reviews                | Opus 4.8          | always for release gate                  | Yes                     | ~1%                | High             |
| Cloud Agent / automation runs                                          | Curated frontier (Sonnet-class default) — always Max Mode | Opus for high-risk | task is high-risk or unattended         | Yes                     | as needed          | Very high        |

*(Model names verified against cursor.com/docs/models-and-pricing, July 2026; substitute the current in-product equivalents — e.g. Claude Sonnet 5 — as the roster rotates.)*

## 9. Escalation Policy

Escalate from Composer/Sonnet-class to premium reasoning (Opus-class / GPT-5.5) **only** when an objective signal fires:

1. Change spans **> ~5 files** or crosses architectural boundaries (frontend + backend + DB in one change).
2. Touches **authentication, authorization, or session/token logic**.
3. Touches **database schema, migrations, or RLS policies** — especially **irreversible / data-loss-capable** migrations.
4. **Security-sensitive** code (secrets handling, input validation, access control).
5. **Standard model failed ≥ 2 attempts** on the same task (tests still red, or reverted work).
6. **Unclear root cause** after one investigation pass.
7. **Concurrency / race conditions** suspected.
8. **Large context genuinely required** (tracing behavior across many modules) — pair with Max Mode.
9. **Multiple external systems** interacting (e.g., Supabase + Edge Function + third-party API + Lovable handoff).
10. **Ambiguous requirements** that survived a Plan-mode clarification pass.
11. **High-cost external workflow** about to run (expensive CI, paid API calls, production data touch).
12. **Production incident** triage.
13. **Final release certification** gate.
14. **High financial/reputational impact** change.

**De-escalation:** once a premium model has produced a plan or diagnosis, hand the bounded implementation back to Composer 2.5/Sonnet (planner/executor split, §11 Pattern E).

## 10. Cost Tradeoff Analysis

All examples use verified Cursor list rates. Assumptions labelled.

**Worked single-task base case** (assume 40K input + 4K output tokens):

- Composer 2.5: 40K×$0.50/M + 4K×$2.50/M = $0.020 + $0.010 = **$0.030**
- Auto: 40K×$1.25/M + 4K×$6/M = $0.050 + $0.024 = **$0.074**
- Claude Sonnet 4.6 ($3/$15): 40K×$3/M + 4K×$15/M = $0.120 + $0.060 = **$0.180**
- Claude Opus 4.8 ($5/$25): 40K×$5/M + 4K×$25/M = $0.200 + $0.100 = **$0.300**

So Opus costs **10× Composer 2.5** on the same task. On Teams add $0.25/M Cursor Token Rate to every non-Auto third-party request.

**Cheap-first vs premium-once (break-even).** If Composer 2.5 costs $0.03/attempt and Opus costs $0.30 once: Composer could fail **9 times** and still break even. Realistically Composer succeeds on routine work first try, so cheap-first wins decisively for the ~75% of routine/standard tasks. Cheap-first *loses* only when the cheap model burns many expensive-context retries on a task it fundamentally cannot do (auth, concurrency) — which is exactly what the §9 escalation signals catch before that waste accrues.

**Premium review vs premium execution.** Reviewing a diff = large-ish input, tiny output. Opus reviewing a 20K-token diff producing 2K tokens = 20K×$5/M + 2K×$25/M = $0.10 + $0.05 = **$0.15**. Opus *writing* the same feature (40K in / 8K out) = $0.20 + $0.20 = **$0.40**. Review captures most of the quality benefit at ~⅓ the premium cost — and the writing was already done cheaply by Composer ($0.03–0.06). **Cheap-implement + premium-review is the most cost-effective high-assurance pattern.**

**Planner/executor.** Premium planning (Opus, 15K in / 3K out = $0.075 + $0.075 = $0.15) + cheap execution (Composer, 40K in / 8K out = $0.02 + $0.02 = $0.04) = **$0.19**, versus all-Opus end-to-end easily $0.40–1.00+. Cheaper and often *better* because planning is where premium reasoning pays off most.

**Context / caching levers:**

- **Cache reads** are ~10× cheaper than fresh input ($0.25/M Auto, $0.30/M Sonnet, $0.50/M Opus). Reusing a warm conversation beats reloading full-repo context in a fresh agent.
- But long conversations accumulate context that is re-sent every turn. **Scoped, bounded tasks send far less context per turn** than one giant "here's my whole repo" thread. Net: reuse cache within a bounded task; start fresh for a new bounded task rather than letting one thread bloat.
- **Parallel agents** don't cost more per token than sequential, but each carries its own context load; running 4 agents that each reload full-repo context multiplies input cost. Prefer parallelism on *independent, scoped* tasks.
- **Cloud Agents** always run Max Mode → large context billed at frontier rates every run. A single multi-file Cloud Agent run can consume 1–2M tokens; at Sonnet rates a 2M-token run (70/30 split) ≈ 1.4M×$3 + 0.6M×$15 = $4.20 + $9.00 = **$13.20**. This is why Cloud Agents must be reserved for high-value work.
- **Retries/failed runs are billed** — there is no refund for a failed agent run. Each failed premium retry is pure waste; the §9 failure-count trigger exists to cap it.

## 11. Multi-Agent Architecture Options

| Pattern                                                                      | Native support                                                          | Requires                    | Works with Cloud Agents | Complexity | Cost                | Reliability          | Best use                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------- | ----------------------- | ---------- | ------------------- | -------------------- | -------------------------------- |
| **A. Manual selection** (human picks model each task)                        | Full (dropdown/CLI)                                                     | Discipline                  | Yes                     | Very low   | Low if disciplined  | Depends on human     | Single dev, immediate            |
| **B. Named agents** (routine/standard/deep/certification)                    | Partial — via Custom modes (beta) + defaults, or external script        | Custom modes or wrapper     | Via API/automations     | Medium     | Low                 | Good                 | Teams wanting task classes       |
| **C. Automatic routing** (system picks by complexity)                        | Partial — Auto (IDE only, not Cloud); real routing needs external logic | Router script/service       | Only via API layer      | High       | Low–med             | Med (routing errors) | Automated orgs                   |
| **D. Two-stage escalation** (cheap inspects/plans → premium if criteria met) | Manual + Plan mode handoff                                              | Discipline or script        | Yes                     | Medium     | Low                 | High                 | Recommended default              |
| **E. Planner/executor** (premium plans → cheap executes)                     | Plan mode → build; subagents with per-model field                       | Plan mode / subagent config | Yes (subagents)         | Medium     | Low                 | High                 | Complex features                 |
| **F. Cheap-first + premium review** (cheap writes → premium reviews diffs)   | Bugbot + manual, or subagent                                            | Bugbot or review step       | Yes                     | Low–med    | Lowest for assurance | Highest             | High-risk changes, certification |

**Recommended blend:** D + E + F. Composer 2.5 does exploration and bounded implementation; Plan mode (optionally on Sonnet/Opus) structures complex features; Opus reviews diffs on high-risk changes and gates certification.

**Cursor + Lovable coordination.** Keep the markdown-handoff model, but **do not** try to make it four separately-configured Cursor "agents" in the product — Cursor has no first-class persistent named-agent-with-bound-model object outside Custom modes (beta) and the API. Recommended simplest design:

- **Cursor Routine / Standard / Deep / Certification are *task labels*, not products** — each label maps to a model + mode in a short team rule/runbook and (optionally) an external CLI wrapper that sets `--model`.
- **Lovable Backend Agent stays a separate tool**, coordinated via committed markdown handoff files (e.g. `docs/handoffs/*.md`) that both sides read/write.
- Use **Custom modes (beta)** to give humans one-click "Deep Reasoning" (Opus) and "Certification" (Opus review) presets if you want more than raw dropdown discipline.
- For unattended/scheduled work, encode the label→model mapping in **Automations** (each automation picks its model) or an **SDK/CLI script**.

## 12. Recommended Operating Model

- **Default model: Composer 2.5** (IDE and CLI). Auto is an acceptable alternative default and is exempt from the Teams Cursor Token Rate — on Teams, prefer Auto/Composer for the cheapest routine lane.
- **Cheaper-model tasks:** all of §7's "Cheap-fast/General" rows — docs, formatting, lint, small UI, tests, search, artifact generation, routine bug fixes.
- **Sonnet-class justified:** cross-module refactors, Supabase migrations, Edge Functions, auth/RLS *implementation*, accessibility depth, anything after 2 Composer failures.
- **Opus-class justified:** architecture, concurrency/race analysis, complex root cause, security review, data-migration planning, release certification, production incidents — mostly as **planner or reviewer**, not executor.
- **Escalate after 2 failed standard attempts;** never let a cheap model exceed ~3 retries on a task matching a §9 signal.
- **Premium should plan and review, not execute,** wherever feasible.
- **Limit repeated expensive context loading:** scope tasks; reuse warm conversations for cache hits; avoid full-repo reloads; reserve Max Mode / Cloud Agents for tasks that truly need broad context.
- **Cloud Agent runs vs interactive vs certification vs security:** interactive IDE = Composer default; Cloud Agents = premium-by-definition, use only for high-value async work with a set spend limit; certification = Composer implements + Opus reviews; security-sensitive = Sonnet implements + Opus reviews, or Opus throughout if small.
- **Track cost against policy** via the usage dashboard filtered by surface (§18).

## 13. Minimal Configuration (single developer, immediate)

- **Config:** Settings → Models: enable Composer 2.5, Claude Sonnet 4.6, Claude Opus 4.8; disable models you'll never use to declutter. Set the model dropdown default to Composer 2.5. Turn on "always show usage summary."
- **Plan required:** Pro ($20/mo).
- **Permissions:** none beyond your account.
- **Scripts/APIs:** none. Pure dropdown discipline + Plan mode for complex tasks.
- **Setup effort:** ~15 minutes.
- **Limitations:** relies entirely on human discipline; no enforcement; no per-mode default.
- **Expected savings:** large — most developers overspend by defaulting to a frontier model for everything; moving routine work to Composer/Auto typically cuts API-pool burn substantially.
- **Risks:** discipline slips under time pressure; easy to forget to de-escalate.

## 14. Managed Configuration (team, structured)

- **Config:** Teams plan. Set **team default model** = Composer 2.5/Auto. Create **Custom modes** (beta) "Deep-Reasoning" (Opus) and "Certification" (Opus, review-oriented instructions). Commit a **team rule** (`.cursor/rules/model-policy.mdc`, `alwaysApply`) documenting the §8 matrix and §9 triggers as *guidance* (remember: it cannot enforce the model). Set a **team spend limit** and **soft-limit alerts** at 50/80/100%. Enable **model blocklist** to hide never-use models. Standard vs Premium seats assigned by observed usage.
- **Plan required:** Teams ($40/user;  Premium $120 for heavy agent users). Model access controls at team level; per-user hard caps require Enterprise.
- **Permissions:** team admin for defaults, blocklists, spend limits, Cloud Agent settings.
- **Scripts/APIs:** optional Admin API pull into a spreadsheet/BI for weekly cost-by-user/surface review.
- **Setup effort:** ~½–1 day.
- **Limitations:** rule is advisory; no per-mode default; Teams caps are team-wide not per-user.
- **Expected savings:** high and *durable* because defaults + blocklists + alerts constrain the whole team, not just the disciplined.
- **Risks:** one heavy user can consume the team-wide cap; mitigate with alerts + Premium-seat isolation.

## 15. Automated Configuration (programmatic routing + enforcement)

- **Config:** A small **routing service / CLI wrapper** that maps a task label (issue label, PR label, or prompt prefix) → `--model`/`model.id`. For unattended work, **Automations** (each with its chosen model + MCP + trigger) and/or the **Cloud Agents REST API / SDK** (`POST /v1/agents` with explicit `model`, per-subagent `model` for planner/executor/reviewer splits). Use **`beforeSubmitPrompt` hook** as a *guardrail* (e.g. block a prompt that names a premium model without a matching escalation label, returning `ask`/`deny` with a message). Collect usage via **Admin API** (spending-data + AI Code Tracking CSV) into a dashboard; enforce **soft/hard spend limits** and alerts. GitHub Actions can invoke the CLI headlessly for CI-triggered agents.
- **Plan required:** Teams minimum; **Enterprise** for per-member spend limits, granular model/provider allow-blocklists (block providers or specific speed/context configs, block-new-by-default), audit logs, AI Code Tracking API.
- **Permissions:** admin + API keys (user or service-account); repo read-write for Cloud Agents.
- **Scripts/APIs:** router (Node/Python via SDK), Admin API collectors, hooks, optional MCP tools.
- **Setup effort:** 1–2 weeks for a solid v1.
- **Limitations:** Cloud Agents can't use Auto (always premium/Max) — router should send only genuinely-hard tasks to Cloud; routing logic can misclassify; API is public beta (may change; webhooks were "coming soon").
- **Expected savings:** highest ceiling and enforceable, but only worth it at scale (many daily agent runs / multiple developers).
- **Risks:** beta API churn; router misroutes cost money; over-engineering for small teams.

## 16. Cursor Settings Checklist

| Setting                    | Where                                                    | Recommended                                             | Exists?                                      |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Default model              | Settings → Models (IDE); Cloud dashboard (Cloud default) | Composer 2.5 / Auto                                     | Yes (global; **no per-mode default**)        |
| Enabled models list        | Settings → Models                                        | Composer 2.5, Sonnet 4.6, Opus 4.8 on; rest off         | Yes                                          |
| Auto mode                  | Model dropdown                                           | Use for routine on Teams (Token-Rate-exempt)            | Yes                                          |
| Max Mode                   | Model picker toggle                                      | Off by default; on only for genuine large-context tasks | Yes (forced on for Cloud Agents)             |
| Premium-model access       | Team model settings (blocklist)                          | Restrict rarely-used premium models                     | Team/Enterprise only                         |
| Spend limits (hard/soft)   | `dashboard/spending`                                     | Set team cap + soft alerts 50/80/100%                   | Team (team-wide); per-user = Enterprise      |
| Usage monitoring           | `dashboard/usage`                                        | Filter by user + surface weekly                         | Yes (Teams/Enterprise dashboard + Admin API) |
| Agent concurrency          | Editor / Cloud dashboard                                 | Parallel via worktrees; cap Cloud parallelism by budget | Partial (no explicit numeric cap setting)    |
| Long-running agents        | Cloud Agents team settings                               | Enable only for trusted users                           | Yes (team toggle)                            |
| Cloud Agent default model  | Cloud Agents settings                                    | Sonnet-class (must support Max Mode)                    | Yes                                          |
| Repository instructions    | `.cursor/rules`, `AGENTS.md`                             | Document policy (advisory only)                         | Yes (cannot bind model)                      |
| Skills                     | `.cursor/skills`                                         | Encode workflows/runbooks                               | Yes (cannot bind model)                      |
| Work-item metadata → model | Issue/PR labels + external router                        | Map label→model                                         | **No native support**; external only         |
| Human approval points      | Auto-run allowlist; hooks; PR review                     | Require review on high-risk; hooks for policy           | Yes                                          |
| On-demand usage            | Billing settings                                         | Enable with a cap, or disable to hard-stop              | Yes                                          |

## 17. Spend Controls

**Native (VERIFIED):**

- **Team spend limits** — monthly cap on total on-demand usage; on-demand stops at the cap until next cycle. **Dynamic spend limits** scale the cap with team size (default-on for teams with a limit since Dec 2025).
- **Soft limits + intelligent alerts** (changelog May 4, 2026) — soft limits avoid blocking users; automatic alerts at 50/80/100% to users and admins.
- **On-demand toggle** — disable to hard-stop at included usage; or set a spend limit to cap pay-as-you-go.
- **Model/provider access controls** (Enterprise) — allow/blocklist by provider or specific model config (speed/context); block new providers/versions by default.
- **Per-member spend limits** — **Enterprise only** (Teams removed per-user hard caps; replaced by alerts).
- **Cloud Agent spend limit** — prompted on first use.
- **Admin Dashboard + Admin API** — usage/spend by user/day/surface; Enterprise adds CSV export + audit logs.

**Gaps + external mitigations (labelled inference):** No native per-run token cap, no native per-user hard cap on Teams, no native "max retries" control. Mitigate externally: (1) `beforeSubmitPrompt`/`stop` hooks to enforce loop limits and block unlabeled premium use; (2) a routing wrapper that refuses premium models without an escalation label; (3) FinOps ingestion (e.g., via Admin API) for chargeback and anomaly alerts; (4) Premium-seat isolation so heavy users don't drain a shared cap; (5) reserve Cloud Agents behind an explicit approval step.

## 18. 30-Day Measurement Plan

**Collect from Cursor natively:** `dashboard/usage` filtered by user and by surface (clients / Cloud Agents / automations / Bugbot / Security Review) gives runs, model, and per-request cost. Admin API (Teams/Enterprise) automates the pull; Enterprise CSV export for bulk.

**Track (lightweight, weekly):**

| Metric                                    | Source                                          |
| ----------------------------------------- | ----------------------------------------------- |
| Runs by model                             | Usage dashboard / Admin API                     |
| Tasks by class                            | Manual tag or issue/PR label                    |
| Cost by task / work item                  | Usage dashboard (per-request cost) + label join |
| First-attempt success                     | PR outcome / test pass on first agent turn      |
| Retries per task                          | Conversation history / hook logging             |
| Escalation rate (% tasks hitting premium) | Model mix by task class                         |
| Human intervention rate                   | Reviewer notes / reverted-diff count            |
| Elapsed time                              | CLI stream events (per-request timing)          |
| Reverted changes                          | Git revert / PR-close tracking                  |
| Test failures                             | CI                                              |
| Defect escape rate                        | Post-merge bug tracking                         |
| Premium-model utilization                 | Cost share of API pool vs Auto/Composer pool    |
| Cost per completed task                   | Total spend ÷ merged tasks                      |

**Method:** commit a `docs/agent-metrics.md` runbook; add a `beforeSubmitPrompt`/`stop` hook that appends `{timestamp, model, prompt-hash, task-label}` to a local/CSV log for retry and escalation counting (the dashboard gives cost but not retries). Review weekly; the decision thresholds that change policy: if premium-pool cost > ~25% of total, tighten escalation; if first-attempt success on Composer < ~70% for a task class, promote that class's default to Sonnet; if any task class shows > 3 avg retries, escalate it earlier.

## 19. Remaining Unknowns

- **Exact current Cloud Agent model roster** and whether any first-party (Composer) option is ever selectable there — docs say "curated selection… always Max Mode," and Auto is rejected; the precise list is discoverable only via `GET /v1/models` on your account.
- **CLI `auto` behavior** — community reports recent CLI versions reject a bare `auto` model on some plans; verify on your version.
- **Whether Cursor has added Claude Sonnet 5** (launched by Anthropic June 30, 2026) to its roster; the §3 Anthropic list reflects the models the Cursor pricing doc currently enumerates (Sonnet 4.x/Opus 4.x/4.8/Fable 5).
- **Webhooks for Cloud Agents v1 API** — "coming soon" as of the beta; confirm current status.
- **Whether Custom modes (beta) persist a bound model reliably** — a community bug report noted Agents-Window model/mode mismatches; verify before relying on it for enforcement.
- **Precise "generous"/system-default model** behind Auto and the omitted-model API path — not publicly enumerated.
- Provider list prices rotate frequently; the §3 table is a July 13, 2026 snapshot.

## 20. Source Appendix

**Primary (official Cursor):** Models & Pricing (cursor.com/docs/models-and-pricing); Teams Pricing (docs/account/teams/pricing); Cursor Token Rate (help/models-and-usage/token-rate); Available models (help/models-and-usage/available-models); Cloud Agents (docs/cloud-agent), Cloud Agent settings (docs/cloud-agent/settings), best practices, capabilities; Cloud Agents API (docs/cloud-agent/api/endpoints); TypeScript SDK (docs/sdk/typescript), Python SDK (docs/sdk/python), SDK launch blog (cursor.com/blog/typescript-sdk); CLI overview/using/configuration/parameters (docs/cli/*), CLI launch blog (cursor.com/blog/cli); Rules (docs/rules); Hooks (docs/hooks); Modes (docs/agent/modes); Plan Mode (docs/agent/plan-mode, blog/plan-mode); Automations (docs/cloud-agent/automations, blog/automations); Enterprise Model & Integration Management (docs/enterprise/model-and-integration-management); Enterprise LLM safety & controls; Spend limits (help/account-and-billing/spend-limits); Usage-based charges (help/account-and-billing/overages); Teams Dashboard (docs/account/teams/dashboard); Admin API; Changelog May 4 2026 (model controls, spend management, usage analytics); Composer 2 / 2.5 launch blogs (cursor.com/blog/composer-2, /composer-2-5); Cloud Agents blog; Best practices for coding with agents (cursor.com/blog/agent-best-practices); Pricing page.

**Provider pricing:** Anthropic (platform.claude.com/docs pricing, verified July 12, 2026 — Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.8 $5/$25, Sonnet 5 intro $2/$10 through Aug 31).

**Secondary/community (used only to surface questions, then verified against primary sources or explicitly labelled):** Cursor Community Forum threads (Auto-model API 400 error, per-mode default feature request, Agents-Window model mismatch bug, Max Mode selection); analyses from Vantage, Finout, DataCamp, ofox.ai, DigitalApplied, LushBinary, CloudZero (Composer 2.5 benchmark figures cross-checked to Cursor's May 18, 2026 launch data).
