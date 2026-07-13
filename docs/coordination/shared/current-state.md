# Current state

Joint summary of where the project stands. Append attributed entries; do
not rewrite another agent's entry. Newest entries at the bottom.

### 2026-07-13 — WI-0001 — Cursor

- The application audit is complete on the repository side and integrated
  with Lovable's backend verification:
  [docs/AUDIT-AND-HARDENING-PLAN.md](../../AUDIT-AND-HARDENING-PLAN.md).
  Readiness rating: **ready for controlled testing; not yet ready for a
  small demo cohort**.
- Cursor owns the repository-side audit findings and the implementation
  plan ([docs/PLAN-CURSOR-AGENT.md](../../PLAN-CURSOR-AGENT.md), phases
  C1–C9). No hardening implementation has started.
- Lovable has performed the initial backend verification
  ([docs/lovable-backend-research-findings.md](../../lovable-backend-research-findings.md))
  and has a pending execution plan
  ([docs/PLAN-LOVABLE-AGENT.md](../../PLAN-LOVABLE-AGENT.md), steps L1–L7 —
  WI-0005). Status of L1–L7: not started as far as Cursor can verify.
- The primary audit target is the happy-path workflow that produces the
  final Word document (research packet → print → annotate → return →
  verify → optional follow-up → final DOCX → download). Live data shows the
  `final_docx`, `followup_research`, and `final_pptx` run kinds have never
  executed in production.
- Active concerns: reliability (live RLS drift on `agent_runs`/`pieces`
  client writes; migration-pipeline ambiguity), testing (no Edge Function
  handler or E2E coverage), timing/progress (no historical duration data;
  hard-coded UI estimates), cost tracking (session-less runs drop cost
  rows; gateway pricing rows probably unseeded), and demo readiness
  (CI red on `main` from pre-existing Prettier errors).
