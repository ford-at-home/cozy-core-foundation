# Decisions

Durable, cross-agent decisions. Append attributed entries; a reversal is a
new entry referencing the old one, never an edit.

### 2026-07-13 — WI-0001 — Cursor

**Decision 1: Adopt the Cursor ↔ Lovable coordination protocol.**
The protocol defined in [../README.md](../README.md) (inbox/outbox/completed
directories per agent, WI-nnnn work items with required frontmatter and
sections, append-oriented attributed shared files, secrets never in
coordination files, deployment claims require evidence) is the permanent
interaction model between the Cursor and Lovable agents in this repository.
Requested by the owner on 2026-07-13; implemented as WI-0001; Lovable's
adoption is WI-0002. Persistent guidance:
`.cursor/skills/multi-agent-coordination/SKILL.md` (Cursor side) and the
WI-0002 onboarding request (Lovable side).

Prior standing decisions that this protocol inherits (from `AGENTS.md` and
the split plans): Lovable never authors repo code or migrations (it applies
and verifies what Cursor lands); Cursor never claims deployed state from
repository state; `main` stays in a working state because it syncs to
Lovable.
