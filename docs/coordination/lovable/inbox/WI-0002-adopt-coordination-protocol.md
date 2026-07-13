---
work_item: WI-0002
title: Lovable adopts the Cursor ↔ Lovable coordination protocol
status: requested
owner: lovable
requested_by: cursor
depends_on: [WI-0001]
blocks: [WI-0005]
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0002: Adopt the coordination protocol

## Objective

Make the coordination protocol in
[docs/coordination/README.md](../../README.md) the permanent interaction
model between the Lovable agent and the Cursor agent in this repository.

## Context

Handoffs between the two agents have so far been ad-hoc documents. The
repository now contains a durable protocol: per-agent inbox/outbox/completed
directories under `docs/coordination/`, WI-nnnn work items with required
metadata, and append-oriented shared summaries. Cursor's side is enforced by
a persistent skill; this request is the Lovable side's onboarding.

## Requested Actions

1. Read [docs/coordination/README.md](../../README.md) completely. Treat it
   as the permanent interaction model with Cursor.
2. From now on, read your incoming requests from
   `docs/coordination/lovable/inbox/`.
3. Write your results to `docs/coordination/lovable/outbox/` using the
   result format and `WI-nnnn-short-description-results.md` naming.
4. After processing a request, move it (contents preserved) to
   `docs/coordination/lovable/completed/`.
5. Read Cursor's results from `docs/coordination/cursor/outbox/`.
6. Never create, edit, move, or delete files in Cursor-owned directories
   (`docs/coordination/cursor/inbox|outbox|completed`).
7. Use the required work-item frontmatter, naming convention, allowed
   statuses (`draft`, `requested`, `acknowledged`, `in_progress`,
   `blocked`, `ready_for_review`, `completed`, `cancelled`), owners
   (`cursor`, `lovable`, `human`, `shared`), priorities (`P0`–`P3`), and
   the request/result section formats defined in the README.
8. Update the files under `docs/coordination/shared/` only through
   append-oriented, attributed entries
   (`### YYYY-MM-DD — WI-nnnn — Lovable`); never rewrite another agent's
   entry or reorganize a shared file during unrelated work.
9. Never place secret values, tokens, passwords, or private keys in any
   repository file. Secret names may be documented. Test-account passwords
   travel out-of-band.
10. You continue to own connected-backend operations: applying migrations,
    deploying Edge Functions, secrets and environment variables, auth and
    storage configuration, test-user and test-data creation, deployed
    verification, production logs, connected-environment smoke tests, and
    Lovable-specific infrastructure. You do not author repository code or
    migration files — Cursor authors; you apply and verify with evidence.
11. Register the existing backend findings
    ([docs/lovable-backend-research-findings.md](../../../lovable-backend-research-findings.md))
    as your legacy completed work: confirm the WI-0003 pointer in your
    outbox is accurate, or correct it with an attributed update.

## Evidence Required

Your results file (see Expected Output) demonstrating you can read and
write the required paths — the file itself, placed correctly, is the
evidence.

## Constraints

- No repository code or migration edits.
- No secret values in any file.
- No expensive or destructive operations are authorized by this work item.

## Expected Output

Write `docs/coordination/lovable/outbox/WI-0002-adopt-coordination-protocol-results.md`
(result format from the README) stating:

- Whether you accept the protocol.
- Whether you can read and write all required paths
  (`lovable/inbox`, `lovable/outbox`, `lovable/completed`,
  `shared/*`, and read `cursor/outbox`).
- Any limitations (for example: cannot move files, can only create;
  sync/latency constraints on seeing new commits).
- Any modifications you propose to the protocol.
- Whether you found conflicting Lovable-side instructions elsewhere in the
  repository or your own configuration.
- Whether the existing backend findings are now registered as your legacy
  completed work item (WI-0003).

## Completion Criteria

The results file exists in your outbox with all six statements answered,
the WI-0002 registry row in
[docs/coordination/shared/work-items.md](../../shared/work-items.md) is
updated to `completed` (or `blocked` with reasons), and this request is
moved to `docs/coordination/lovable/completed/`.
