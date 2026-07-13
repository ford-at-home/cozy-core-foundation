---
work_item: WI-0001
title: Implement Cursor ↔ Lovable coordination protocol
status: ready_for_review
owner: cursor
requested_by: human
depends_on: []
blocks: [WI-0002]
created: 2026-07-13
updated: 2026-07-13
priority: P0
---

# WI-0001: Implement the coordination protocol — Results

## Status

`ready_for_review` — all required files exist and validate; awaiting human
review and Lovable's adoption (WI-0002) before `completed`.

## Actions Performed

- Inspected existing agent-instruction conventions (`AGENTS.md` router,
  `.cursor/skills/<name>/SKILL.md` frontmatter format, `.cursor/agents/`
  reviewers, the guard tests `tests/agent-os.test.ts` and
  `tests/docs-references.test.ts`) and extended them instead of creating a
  competing system.
- Created the coordination tree under `docs/coordination/` (per-agent
  `inbox/`/`outbox/`/`completed/` with README direction rules — no
  `.gitkeep` needed since every directory has a README — and seven `shared/`
  files initialized with real state, not placeholders where evidence
  existed).
- Wrote the human-readable protocol source of truth:
  [docs/coordination/README.md](../../README.md) (ownership, direction,
  work-item lifecycle, metadata, naming, shared-state rules, secret rules,
  deployment-evidence rules, human intervention, conflict resolution, one
  worked example).
- Created the persistent Cursor skill
  `.cursor/skills/multi-agent-coordination/SKILL.md` and wired it into
  `AGENTS.md` (router row, rule 11 extension, mandatory-workflow step 3).
- Registered legacy handoffs without duplicating them: WI-0003 (Lovable
  backend verification → pointer in Lovable's outbox), WI-0004 (audit and
  hardening plan → pointer in Cursor's outbox), WI-0005 (Lovable execution
  plan L1–L7 → request in Lovable's inbox).
- Created the Lovable onboarding request
  [WI-0002](../../lovable/inbox/WI-0002-adopt-coordination-protocol.md).

## Findings

- The repository already had a strong skill convention and two guard tests
  that police agent guidance; both now cover the new files.
- Existing pre-protocol handoff documents remain authoritative for their
  content; the coordination layer points at them.

## Evidence

- Registry: [shared/work-items.md](../../shared/work-items.md) — WI-0001
  through WI-0005, unique, with request/result links.
- Guard suites pass (see Validation).

## Files or Resources Changed

Created: 18 files under `docs/coordination/` and the skill file. Updated:
`AGENTS.md` (three insertions). No application code, database resources, or
deployed systems changed; no existing reports overwritten.

## Validation Performed

- `npm test` — all vitest suites pass, including `tests/agent-os.test.ts`
  (skill routed by AGENTS.md, paths exist) and
  `tests/docs-references.test.ts` (all relative links in the new docs
  resolve).
- `bash scripts/check-secrets.sh` — pass (no secret values in coordination
  files).
- Manual direction-consistency read of every README and the skill.

## Remaining Risks

- The protocol is one-directional until Lovable confirms adoption
  (WI-0002); Lovable may report path or file-move limitations that require
  protocol amendments.

## Blockers

None for this item itself; WI-0002 is the follow-on.

## Recommended Next Action

Owner points the Lovable agent at
[docs/coordination/lovable/inbox/WI-0002-adopt-coordination-protocol.md](../../lovable/inbox/WI-0002-adopt-coordination-protocol.md).
