# Cursor ↔ Lovable coordination protocol

This directory is the permanent, asynchronous coordination channel between
the two agents that work on this product:

- **Cursor** — repository-side work (code, migrations-as-files, tests, docs).
- **Lovable** — connected-environment work (applying migrations, deploys,
  secrets, auth settings, test accounts, live queries and logs).

The repository is the only medium both agents reliably share, so these files
act as a lightweight asynchronous API: requests go into the other agent's
inbox, results come back through the performing agent's outbox, and shared
summaries record durable state. Humans can read and intervene anywhere.

Persistent agent guidance lives in
[.cursor/skills/multi-agent-coordination/SKILL.md](../../.cursor/skills/multi-agent-coordination/SKILL.md)
(Cursor) and in the onboarding work item
[lovable/inbox/WI-0002-adopt-coordination-protocol.md](lovable/inbox/WI-0002-adopt-coordination-protocol.md)
(Lovable). This README is the human-readable source of truth; if the three
ever disagree, this README wins and the others must be corrected.

## Why this exists

Before this protocol, handoffs were ad-hoc documents (briefs, findings
files, split plans) with no fixed location, format, or ownership rules. That
produced two parallel migration streams, documentation that contradicted the
live database, and no reliable way for either agent to know what the other
had actually done. This protocol fixes the _coordination_ layer; the work
itself is tracked in [shared/work-items.md](shared/work-items.md).

## Ownership

**Cursor owns** repository-controlled work: frontend code, routes, UX,
accessibility, tests (unit/component/integration/Playwright), fixtures and
mocks, build tooling, CI, repository documentation, source-controlled Edge
Function code, source-controlled migrations and schemas, and analysis based
on repository evidence. Cursor may modify any source-controlled backend
artifact — but modifying source is **not** deployment, and Cursor must never
claim a backend change is live merely because the file changed.

**Lovable owns** connected/deployed environment operations: Lovable project
configuration, verifying the connected Supabase project, **applying**
migrations, **deploying** Edge Functions, creating backend resources,
auth-provider configuration, storage bucket configuration, deployed RLS
verification, secret management, environment variables, test-user and
test-data creation, deployed function inspection, production logs,
deployment verification, connected-environment smoke tests, and
Lovable-specific infrastructure.

**Shared work** spans both (Cursor writes a migration → Lovable applies it
and reports; Lovable creates test accounts → Cursor uses them in tests;
Lovable reports a backend constraint → Cursor changes application logic).
Cross-boundary work always gets an explicit handoff via a work item — never
an assumption that the other agent has acted.

**Humans** own decisions neither agent can make: spending money, secret
values, destructive operations, external dashboards (Stripe, Cursor
platform, Parallel, provider billing), and conflict resolution.

## Directory layout and message direction

```text
docs/coordination/
  cursor/
    inbox/       ← Lovable (or a human) writes requests FOR Cursor here
    outbox/      ← Cursor writes its results/handoffs here
    completed/   ← Cursor archives its processed inbox requests here
  lovable/
    inbox/       ← Cursor (or a human) writes requests FOR Lovable here
    outbox/      ← Lovable writes its results/handoffs here
    completed/   ← Lovable archives its processed inbox requests here
  shared/        ← append-oriented summaries both agents update
```

Rules of direction:

- To request work from the **other** agent, write into **that agent's
  inbox**. An agent never places a request for the other agent in its own
  inbox.
- The performing agent writes its result into **its own outbox**. The
  requesting agent reads it there.
- Each agent may create and modify files only in **its own** `outbox/` and
  `completed/`, and may **move** (archive) processed requests from its own
  `inbox/` to its own `completed/` preserving the contents. Nobody edits
  another agent's inbox request in place, overwrites another agent's
  result, or marks another agent's work complete.

## Work items

Every substantial coordination request has a work-item ID: `WI-0001`,
incremented sequentially, never reused. The registry and next-free ID live
in [shared/work-items.md](shared/work-items.md).

**File naming** (lowercase, hyphenated short description):

- Request (in an inbox): `WI-0001-short-description.md`
- Result (in an outbox): `WI-0001-short-description-results.md`
- Completion/archive record: `WI-0001-short-description-completed.md`

**Required frontmatter** on every work-item file:

```yaml
---
work_item: WI-0001
title: Concise title
status: requested
owner: lovable
requested_by: cursor
depends_on: []
blocks: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
priority: P0
# Optional but recommended when the work will spend real money on the API pool
# (Cloud Agent runs, paid research, paid provider calls). See the "Model and
# cost fields" subsection below.
# model_class: general
# estimated_cost_usd: 0.05
---
```

Allowed `status`: `draft`, `requested`, `acknowledged`, `in_progress`,
`blocked`, `ready_for_review`, `completed`, `cancelled`.
Allowed `owner`: `cursor`, `lovable`, `human`, `shared`.
Allowed `priority`: `P0`, `P1`, `P2`, `P3`.
Allowed `model_class` (optional): `cheap-fast`, `general`,
`high-intelligence`, `premium`.

**Request body sections** (all required):

```markdown
# WI-0001: Title

## Objective

## Context

## Requested Actions

## Evidence Required

## Constraints

## Expected Output

## Completion Criteria
```

**Result body sections** (all required):

```markdown
# WI-0001: Title — Results

## Status

## Actions Performed

## Findings

## Evidence

## Files or Resources Changed

## Validation Performed

## Remaining Risks

## Blockers

## Recommended Next Action
```

**Optional result section — `## Model and Cost`.** Required in spirit when
the work involved paid runs (Cloud Agent, deep research, paid provider
calls). Record the model actually used (may differ from `model_class` in
the request), the observed cost from the Cursor usage dashboard or Admin
API, and a link to the dashboard row if available. This is what makes the
30-day measurement in [../agent-metrics.md](../agent-metrics.md) possible
without manual archaeology.

Requests that ask for backend action must additionally state: the exact
backend action, repository files involved, which environment to inspect or
modify, evidence required, whether deployment is permitted, whether data
creation is permitted, whether real external-service calls are permitted,
cost constraints, rollback/recovery expectations, and completion criteria.

## Model and cost fields

The optional `model_class` and `estimated_cost_usd` frontmatter fields, plus
the optional `## Model and Cost` result section, exist so the 30-day
measurement process in [../agent-metrics.md](../agent-metrics.md) can join
work items to observed Cursor spend. The full policy is in the
[model-selection-and-spend skill](../../.cursor/skills/model-selection-and-spend/SKILL.md);
the classes are:

- `cheap-fast` — Composer 2.5, Auto, Haiku-class, Gemini Flash.
- `general` — Composer 2.5 / Auto for standard implementation.
- `high-intelligence` — Sonnet-class, GPT-5.2 – 5.4, Gemini 3 Pro.
- `premium` — Opus-class, GPT-5.5, Fable 5 — used mostly for planning
  and diff review, rarely as executor.

Fields are optional (they were added after WI-0001 – WI-0007 were filed and
existing rows are grandfathered), but strongly recommended for any WI
whose owner will dispatch a Cloud Agent or run paid research. Repository
files never switch the active model; these fields document intent and
observed reality only.

## Work-item lifecycle

1. Requester allocates the next ID in
   [shared/work-items.md](shared/work-items.md) (add the row in the same
   commit as the request file — the row _is_ the ID reservation).
2. Requester writes `WI-nnnn-short-description.md` into the performer's
   inbox with status `requested`.
3. Performer sets `acknowledged` → `in_progress` (updating the frontmatter
   `status`/`updated` of the request file is the one permitted edit by the
   performer, and only those fields), does the work, and writes
   `…-results.md` into its own outbox with evidence.
4. Performer updates the registry row and relevant shared summaries
   (append-oriented, attributed — see below), records unresolved blockers
   in [shared/blockers.md](shared/blockers.md), and archives the request
   into its `completed/`.
5. Requester reads the result from the performer's outbox and proceeds.
   Status `completed` is set only when the completion criteria are met with
   evidence; `ready_for_review` when a human or the requester should verify
   first.

## Shared-state rules

The files in `shared/` are joint summaries. Because both agents write them,
updates must be **append-oriented and attributable**. Add entries in this
form; never rewrite another agent's entry; never reorganize a shared file
during unrelated work:

```markdown
### YYYY-MM-DD — WI-0001 — Cursor

[entry]
```

## Secrets and safety

- **Never** put passwords, tokens, private keys, or any secret value in a
  coordination file (or anywhere in the repository). Secret **names** may be
  documented when necessary. Test-account passwords travel out-of-band.
- Never trigger expensive workflows (agent runs, deep research, paid
  generation) unless the work item explicitly authorizes them, with a cost
  constraint.
- Never run destructive backend commands without explicit human
  authorization recorded in the work item.
- Never treat a plan as implementation, and never treat repository state as
  proof of deployed state. Deployment claims require returned evidence
  (query output, log lines, version identifiers) in a results file.
- Separate verified facts from assumptions and open questions in every
  result.

## Human intervention

A human may, at any time: write a request into either inbox
(`requested_by: human`), edit any shared file (attributed entries, like the
agents), change a work item's status or priority, or cancel a work item
(`status: cancelled` plus an attributed note in
[shared/decisions.md](shared/decisions.md) if the cancellation reflects a
decision). Humans are the escalation path for anything ambiguous.

## Conflict resolution

- Ownership disagreement between the agents → the requester files the work
  item with `owner: shared` and a human assigns it; neither agent proceeds
  unilaterally on contested ground.
- Contradictory instructions between this README, the skill, and onboarding
  files → this README wins; file a work item to fix the others.
- Evidence conflict (repository says X, deployed environment says Y) →
  record both with sources in [shared/blockers.md](shared/blockers.md) or
  the result file; deployed evidence describes _what is_, repository
  evidence describes _what is intended_; neither is silently "corrected" to
  match the other.
- Two agents needing the same shared file → append-only discipline makes
  last-writer-wins safe; if a true edit collision happens, the later writer
  re-applies the earlier entry verbatim before their own.

## Worked example

1. Cursor authors `supabase/migrations/<timestamp>_progress_stats.sql` in a
   normal code commit.
2. Cursor allocates `WI-0007` in the registry and writes
   `docs/coordination/lovable/inbox/WI-0007-apply-progress-migration.md` —
   objective, the file path, environment (production), evidence required
   (`schema_migrations` row + object existence query), deployment permitted:
   yes, data creation: no, external calls: no, cost: none, rollback: forward
   fix, completion criteria.
3. Lovable reads its inbox, sets the request `in_progress`, applies the
   migration through the established pipeline.
4. Lovable writes
   `docs/coordination/lovable/outbox/WI-0007-apply-progress-migration-results.md`
   with the query output as evidence, updates the `WI-0007` registry row,
   and archives the request to `docs/coordination/lovable/completed/`.
5. Cursor reads the result, and only then builds the frontend feature that
   depends on the applied schema.
6. Both agents' registry updates are separate attributed entries; neither
   rewrites the other's.

## Relationship to existing documents

The pre-protocol handoffs are registered as legacy work items (WI-0003,
WI-0004, WI-0005) in [shared/work-items.md](shared/work-items.md), with
pointer files in the appropriate outboxes/inboxes. The original documents
([../LOVABLE-BACKEND-VERIFICATION.md](../LOVABLE-BACKEND-VERIFICATION.md),
[../lovable-backend-research-findings.md](../lovable-backend-research-findings.md),
[../AUDIT-AND-HARDENING-PLAN.md](../AUDIT-AND-HARDENING-PLAN.md),
[../PLAN-CURSOR-AGENT.md](../PLAN-CURSOR-AGENT.md),
[../PLAN-LOVABLE-AGENT.md](../PLAN-LOVABLE-AGENT.md)) remain authoritative
for their content and are not duplicated here.
