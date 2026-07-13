# Blockers

Cross-agent blockers only (a blocker = something one agent or a human must
do before another party's work can proceed). Append attributed entries;
mark resolution with a follow-up entry, never by deleting.

### 2026-07-13 — WI-0001 — Cursor

Known blockers at protocol adoption (sources: audit §12,
[docs/PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md),
[docs/PLAN-LOVABLE-AGENT.md](../../PLAN-LOVABLE-AGENT.md)):

1. **Migration-pipeline unknown** — whether repo-authored migrations get
   applied to the connected database at all (10 unapplied precedents).
   Blocks Cursor phase C4 and every schema-backed backlog item. Resolver:
   Lovable step L3 after Cursor pushes the C2 marker migration.
2. **No test accounts** — blocks the RLS probe suite (C6) and the
   certification run (L7/P0.10). Resolver: Lovable step L2.
3. **Auth email-confirmation/captcha state unknown** — blocks inviting any
   demo user (free-credit farming exposure). Resolver: Lovable step L1 /
   owner.
4. **Edge Function deploy mechanism unverified** — whether pushes to `main`
   redeploy functions. Blocks treating C3 fixes as live. Resolver: Lovable
   step L6.
5. **Lovable protocol adoption pending** (WI-0002) — until confirmed, the
   inbox/outbox channel is one-directional.

This inventory reflects the audit as of 2026-07-13 and has not been
re-reconciled since; agents should append newly discovered blockers here.
