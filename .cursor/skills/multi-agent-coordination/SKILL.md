---
name: multi-agent-coordination
description: Coordinate with the Lovable agent through the docs/coordination/ inbox/outbox protocol — reading incoming requests, filing work items with WI-nnnn IDs, handing off backend actions (applying migrations, deploys, secrets, test accounts, live verification), and updating shared state without overwriting the other agent's records. Use at the start of any material task, whenever work requires the connected/deployed environment, and whenever a task produces results the Lovable agent or a human must act on.
---

# multi-agent-coordination

## Purpose

This repository is shared by two agents: **Cursor** (repository-side work)
and **Lovable** (connected/deployed environment work). The repository is the
only medium both reliably share, so `docs/coordination/` operates as a
lightweight asynchronous API between them. This skill makes Cursor's side of
that protocol mandatory and mechanical. The human-readable source of truth
is `docs/coordination/README.md` — if this skill and that README ever
disagree, the README wins and this skill must be fixed.

## Use this skill when

- Starting any material task in this repository (the startup procedure
  below is part of orientation).
- A task requires anything in Lovable's domain: applying migrations,
  deploying Edge Functions, secrets or environment variables, auth or
  storage configuration, test accounts or test data in the connected
  environment, deployed verification, production logs, or
  connected-environment smoke tests.
- Completing work whose results the Lovable agent or a human must act on.
- You find an unprocessed request in Cursor's inbox.

## Do not use this skill when

- The task is a trivial, self-contained repository change with no
  cross-agent dependency and no active inbox items — then a quick inbox
  check during orientation is enough.

## Required context

- `docs/coordination/README.md` — the full protocol (ownership, direction,
  formats, lifecycle, safety, conflict resolution).
- `docs/coordination/shared/work-items.md` — registry and next free ID.

## Procedure

### Startup (before beginning a material task)

1. Read `docs/coordination/README.md`,
   `docs/coordination/shared/current-state.md`,
   `docs/coordination/shared/blockers.md`,
   `docs/coordination/shared/decisions.md`, and
   `docs/coordination/shared/work-items.md`.
2. Read every active file in `docs/coordination/cursor/inbox/`.
3. Inspect relevant recent results in `docs/coordination/lovable/outbox/`.
4. Determine whether the requested work belongs to Cursor, Lovable, or
   both (ownership table below).
5. Identify the applicable work item, or allocate the next WI-nnnn ID in
   the registry, before making substantial changes.

### Ownership

**Cursor owns** repository-controlled work: frontend code, React
components, routes and application flow, UX, accessibility, repository
architecture, unit/component/integration/Playwright tests, fixtures and
mocks, file validation, build tooling, CI configuration, repository
documentation, source-controlled Edge Function code, source-controlled
migrations and schemas/generated types, and analysis/planning from
repository evidence. Cursor may modify source-controlled backend artifacts
— but **modifying source is not deployment**; never claim a backend change
is live because a file changed.

**Lovable owns** connected/deployed operations: Lovable project
configuration, connected Supabase verification, applying migrations,
deploying Edge Functions, creating/updating backend resources, auth
provider configuration, storage bucket configuration, deployed RLS
verification, secret management, environment variables, test-user and
test-data creation, deployed function inspection, production/staging logs,
deployment verification, connected-environment smoke tests, and
Lovable-specific infrastructure.

**Shared work** gets an explicit handoff, never an assumption: Cursor
writes a migration → Lovable applies and reports; Lovable creates test
accounts → Cursor uses them in Playwright; Lovable reports a backend
constraint → Cursor adapts the application; Cursor identifies needed
instrumentation → Lovable verifies deployed data.

### Message direction

- Request work **from Lovable** → write
  `docs/coordination/lovable/inbox/WI-<nnnn>-short-description.md`.
- Incoming work **for Cursor** arrives in `docs/coordination/cursor/inbox/`
  (written by Lovable or a human). Never place a request for the other
  agent in your own inbox.
- Cursor's results go to
  `docs/coordination/cursor/outbox/WI-<nnnn>-short-description-results.md`;
  read Lovable's results from `docs/coordination/lovable/outbox/`.
- Cursor creates/modifies files only in its own `outbox/` and `completed/`
  (plus new requests in Lovable's inbox); the one permitted in-place edit
  of an inbox request is the performer updating its `status`/`updated`
  frontmatter.

### Work-item mechanics

IDs are `WI-nnnn`, sequential, never reused; the registry row in
`docs/coordination/shared/work-items.md` reserves the ID in the same commit
as the request file. Required frontmatter, allowed statuses (`draft`,
`requested`, `acknowledged`, `in_progress`, `blocked`, `ready_for_review`,
`completed`, `cancelled`), owners (`cursor`, `lovable`, `human`, `shared`),
priorities (`P0`–`P3`), and the request/result section formats are defined
in `docs/coordination/README.md` — copy an existing work-item file as the
template rather than improvising.

Requests to Lovable for backend action must state: the exact backend
action, repository files involved, environment to inspect/modify, evidence
required, whether deployment is permitted, whether data creation is
permitted, whether real external-service calls are permitted, cost
constraints, rollback/recovery expectations, and completion criteria.

### Completion (when Cursor finishes a work item)

1. Write the result file to `docs/coordination/cursor/outbox/` (all result
   sections, evidence included).
2. Update the registry row in `docs/coordination/shared/work-items.md`.
3. Update relevant shared summaries (append-oriented, attributed:
   `### YYYY-MM-DD — WI-nnnn — Cursor`).
4. Record unresolved blockers in `docs/coordination/shared/blockers.md`.
5. Move the processed Cursor inbox request to
   `docs/coordination/cursor/completed/`, contents preserved.
6. Do not move or edit Lovable-owned files.

While waiting on Lovable, continue all unblocked repository work — never
idle on a pending handoff.

### Safety rules (non-negotiable)

- Never edit another agent's inbox request in place (beyond the performer's
  own `status`/`updated` fields); never overwrite another agent's result;
  never silently mark another agent's work complete.
- Never assume a deployment succeeded without returned evidence in a
  results file.
- Never include passwords, tokens, private keys, or secret values in
  coordination files; secret names are acceptable when necessary.
- Never trigger expensive workflows unless the work item explicitly
  authorizes them; never run destructive backend commands without explicit
  human authorization.
- Never treat a plan as implementation, or repository state as proof of
  deployed state. Separate verified facts from assumptions and open
  questions.

## Validation

- [ ] Startup reads performed (shared files + inbox + relevant outbox).
- [ ] Work classified against the ownership table; cross-boundary parts
      have explicit work items, not assumptions.
- [ ] Any new WI-nnnn is unique, registered in the same commit, and its
      files follow the naming/frontmatter/section formats.
- [ ] Shared-file updates are append-oriented and attributed; no other
      agent's entries were rewritten.
- [ ] No secret values anywhere; `bash scripts/check-secrets.sh` still
      passes.
- [ ] `npm test` passes (the guard suites in `tests/agent-os.test.ts` and
      `tests/docs-references.test.ts` cover these files' references).

## Failure modes (seen or likely in this repo)

- Claiming a migration or Edge Function change is live because the file is
  on `main` — this exact assumption produced 10 unapplied migrations and a
  live database that contradicts the documented security posture.
- Duplicating a handoff's content into coordination files instead of
  pointing at the authoritative document (registry rows + pointer files,
  not copies).
- Writing a request into Cursor's own inbox instead of Lovable's.
- Reorganizing or "cleaning up" a shared file while doing unrelated work,
  destroying the other agent's entries.
- Blocking idle on a Lovable handoff instead of continuing unblocked
  repository work.
- Inventing a parallel tracking system (new status docs, ad-hoc TODO files)
  instead of using the registry.

## Output contract

Any task that used this skill reports: work-item IDs touched or created,
files written per directory, handoffs now pending on Lovable (with the
blocking relationship), and shared files updated.

## References

- `docs/coordination/README.md` (authoritative protocol)
- `docs/coordination/shared/work-items.md` (registry + next free ID)
- `docs/PLAN-CURSOR-AGENT.md`, `docs/PLAN-LOVABLE-AGENT.md` (the split
  hardening plans this protocol now carries)
