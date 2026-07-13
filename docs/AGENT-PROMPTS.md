# Agent prompts and skill-system maintenance

Reusable prompts for launching Cursor implementation agents on this
repository, plus guidance for maintaining the skill system itself.

How the pieces fit together:

- **`AGENTS.md`** — permanent rules, the skill router, the mandatory workflow,
  and the final report contract. Agents read it automatically.
- **`.cursor/skills/<name>/SKILL.md`** — repeatable procedures with validation.
- **`.cursor/agents/*.md`** — read-only reviewer subagents.
- **`scripts/check-*.sh` + `.github/workflows/ci.yml`** — deterministic
  enforcement; agents run these locally, CI repeats them.

## Prompt preamble (include in every implementation task)

```
Before editing:
1. Read AGENTS.md (rules + skill router) and docs/ARCHITECTURE.md.
2. Identify the skills applicable to this task from the router.
3. Read those skill files in .cursor/skills/ completely.
4. State which skills you are applying and why.
5. State the model class you will use (Composer 2.5 by default) and the
   escalation triggers from model-selection-and-spend you are watching for.
6. Follow their procedures and validation requirements.

Your final response must end with the report contract from AGENTS.md
(Skills used / Model class used / Validation completed / Manual actions still
required / Known limitations).
```

## Task prompts

### General implementation

```
<PREAMBLE>

Task: <describe the change>

Constraints:
- Start with the repository-orientation skill; state the affected layers and
  the existing pattern you will follow before writing code.
- Do not add features, dependencies, or refactors beyond this task.
- Model: default Composer 2.5. Escalate to Sonnet-class only if any
  model-selection-and-spend §Escalation-checklist signal fires; escalate to
  Opus-class only for planning or diff review, never routine execution.
- Finish with the production-readiness skill before your final report.
```

### Mobile / UI work

```
<PREAMBLE>

Task: <describe the UI change, e.g. "Polish the run detail page for mobile
without changing its features or visual identity.">

Constraints:
- Apply the mobile-ui-polish skill; mobile (375px) is verified first.
- Preserve the editorial dark theme and design tokens in src/styles.css.
- Do not touch the print iframe content — that is print-artifact-fidelity
  territory.
- Model: default Composer 2.5. Escalate to Sonnet-class only if the change is
  design-sensitive or crosses several components. Opus is not justified for
  mobile-polish work.
- Ask the mobile-ux-reviewer subagent (.cursor/agents/mobile-ux-reviewer.md)
  to review the diff before you finish, and include its verdict.
```

### Print / PDF work

```
<PREAMBLE>

Task: <describe the print change, e.g. "Fix the annotated draft so preview
and generated PDF fit US Letter with stable pagination.">

Constraints:
- Apply the print-artifact-fidelity skill. US Letter only; the paged-media
  engine is the single renderer (no client PDF libraries).
- If the anchor rule changes, update src/styles/print.css,
  contract/references/MARKUP.md, and tests/anchor-reference.ts together;
  run scripts/check-print-contract.sh.
- Run npm test (Chromium via `npx playwright install chromium`) — the
  print-fidelity suite is the authoritative check — and inspect the
  regenerated PDFs in test-artifacts/print/ for the affected fixtures.
- Model: default Composer 2.5. Escalate to Sonnet-class only for stubborn
  anchor / pagination bugs after two Composer failures.
- Ask the print-layout-reviewer subagent to review the diff and include its
  verdict.
```

### Backend / Supabase work

```
<PREAMBLE>

Task: <describe the backend change, e.g. "Add a protected table and Edge
Function while preserving RLS.">

Constraints:
- Apply the supabase-change skill (and run-orchestration-change if run
  states, webhooks, dispatch, or costs are involved).
- Database changes are new timestamped migrations with RLS + policies in the
  same file. Never weaken an existing policy.
- Run: npm run test:functions, scripts/check-migrations.sh,
  scripts/check-secrets.sh.
- List every manual action (apply migration, deploy function, set secret,
  regenerate types) — do not claim external work was done.
- Model: Sonnet-class as default (migrations, RLS, and Edge Functions are
  §Escalation-checklist signals 3 and 4). Escalate to Opus-class for
  irreversible / data-loss-capable migrations or any auth / RLS / secret
  logic. Use cheap-implement + premium-review: implement on Sonnet, then
  have the backend-integrity-reviewer run on Opus.
- Ask the backend-integrity-reviewer subagent to review the diff and include
  its verdict.
```

### Orchestration / cost / billing work

```
<PREAMBLE>

Task: <describe the change, e.g. "Record a new billable operation for X",
"Handle a new webhook event type", or "Adjust the credit hold for research
runs.">

Constraints:
- Apply the run-orchestration-change skill. Its invariants (monotonic state,
  idempotency keys, append-only costs and ledger, HMAC/Stripe-signature-only
  webhook trust) are non-negotiable.
- For anything credit- or Stripe-adjacent, also apply the billing-and-credits
  skill and read docs/BILLING.md first; obey its money rules: webhook-only
  grants, SECURITY DEFINER balance functions, no client-supplied prices,
  holds released on failure.
- Name every idempotency key you introduce and its redelivery behavior.
- Add Deno tests covering duplicate and out-of-order delivery.
- Model: Sonnet-class as default. Any change that touches the credit ledger,
  reservation flow, Stripe webhook, or cost recording is money-adjacent and
  requires cheap-implement + premium-review: implement on Sonnet, then have
  the backend-integrity-reviewer run on Opus. Escalate to Opus-class for
  suspected concurrency / race conditions.
- Ask the backend-integrity-reviewer subagent to review the diff and include
  its verdict.
```

### Final review / release

```
Read AGENTS.md, then apply the production-readiness skill to the current
branch diff against main.

Run every deterministic check, walk the failure states relevant to the diff,
and end with the skill's verdict block (Checks / Failure states reviewed /
Risks / Rollback / Manual actions / Verdict). Do not fix issues in this task;
report them.

Model: Opus-class. Release certification is one of the always-escalate cases
in the model-selection-and-spend skill (§Escalation-checklist signal 13).
The review is input-heavy and output-light, so premium is genuinely
justified here.
```

### Certification (cheap implement → premium review)

For release-gated or high-risk changes (billing, auth, RLS, migrations,
production-impact code), split the model across two turns:

```
<PREAMBLE>

Turn 1 — Implementation:

Task: <describe the implementation, e.g. "Add the new billable operation X
per docs/BILLING.md.">

Constraints:
- Apply the domain skills required (billing-and-credits, supabase-change,
  run-orchestration-change, etc.) as the router indicates.
- Model: default Composer 2.5. Escalate to Sonnet-class if the change
  spans several files or touches RLS / auth / migrations.
- Produce a minimal, complete diff. Do not include the review in this turn.
```

```
Turn 2 — Review (a new agent turn on a premium model):

Task: Review the branch diff for <turn 1's scope>.

Constraints:
- Apply the model-selection-and-spend and production-readiness skills.
- Model: Opus-class. Review only — do not modify code in this turn.
- Ask the appropriate reviewer subagent (backend-integrity-reviewer for
  billing / auth / RLS / migrations; mobile-ux-reviewer for UI;
  print-layout-reviewer for print) to run in this turn, and include its
  verdict.
- If issues are found, file them for a follow-up turn — do not fix them
  here (the premium reviewer is not the cheap fixer).
```

Cost intuition (per docs/cursor-model-selection-research.md §10): reviewing
a 20K-token diff on Opus costs ~$0.15; writing the same feature on Opus
costs ~$0.40. Composer 2.5 wrote it for ~$0.03. Total ~$0.18 versus $0.40 —
same assurance level, roughly ⅓ the premium cost.

## Maintenance guidance

### When to create a new skill

Create one when a class of work recurs, has a recognizable trigger, a
repeatable procedure, and checkable validation. Do not create skills for
one-off tasks, generic coding advice, or anything a script could enforce
instead — add the script. (The dedicated billing skill flagged here
previously now exists: `.cursor/skills/billing-and-credits/SKILL.md`.)

### When to revise an existing skill

- The architecture it references changed (routes moved, a convention changed,
  a check was added). Whoever changes the architecture updates the skill and
  `docs/ARCHITECTURE.md` **in the same PR** — that is the ownership rule.
- An agent following the skill still made a mistake: add that mistake to the
  skill's Failure modes, or better, add a deterministic check.
- A skill's validation section references commands that no longer exist
  (CI failing on `scripts/check-*.sh` is the tripwire for this).

### When to retire a skill

Delete a skill when its subsystem is removed or its content has been fully
replaced by deterministic checks. Remove its router row in `AGENTS.md` in the
same commit. An obsolete skill is worse than none — it teaches confidently
wrong procedure.

### How agents report missing guidance

The final report's "Known limitations" section is the channel: if a task had
no applicable skill and required non-obvious repository knowledge, the agent
states `No skill covered <X>; consider adding one`. A recurring report of the
same gap is the signal to write the skill.

### Evaluating skill effectiveness

Watch the final reports over time:

- Are "Validation completed" sections listing real commands with real results?
- Do the same Failure modes keep happening anyway? (Skill is unread or
  unclear — sharpen the trigger phrases in its frontmatter description.)
- Are agents using skills that don't apply? (Router table rows too broad.)
- Is CI catching things skills should have prevented? (Fine — that is CI's
  job — but repeated hits mean the skill's procedure needs the step earlier.)
