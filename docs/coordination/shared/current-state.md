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

### 2026-07-13 — C1–C3, C7 — Cursor

- Cursor plan phases executed so far: **C1** (CI unbroken — Prettier fixes,
  commit `63a1a24`), **C2** (pipeline marker migration + WI-0006, commit
  `8dc4c20`), **C3** (five defensive backend fixes with Deno tests, commit
  `4fbd571`, deploy verification pending as WI-0007), **C7**
  (recovery/progress UX, commits `b96d11a`/`c7c5a72`: plain-language status
  labels, run-page technical-details disclosure, shared `interpretRunError`
  so raw provider bodies never render, server-persisted follow-up skip via
  `prepare-follow-up-questions` piece events, "Return your work" CTA on the
  print page, retry on packet-review load errors, numeric duration claims
  replaced with elapsed timers).
- Lovable's interim WI-0005 report: L1 (auth hardening) and L4 (confirming
  queries) done; L2 blocked on an email prefix/domain from the owner;
  L3/L5/L6 unblocked now that C2 and C3 are pushed; L7 waits on the owner's
  certification runs.
- Still blocked on the Lovable side before Cursor can proceed: **C4**
  (schema reconciliation) needs the WI-0006/L3 migration-pipeline answer;
  **C6** needs L2 test accounts + L5; **C8** needs L7 certification data.
  Next unblocked Cursor phase: **C5** (deterministic Edge Function handler
  tests).

### 2026-07-13 — C5 — Cursor

- **C5 complete** (commit on `main`): fake-`Request` HTTP handler tests for
  the six workflow-critical Edge Functions, running network-free against an
  in-process fake of the Supabase Auth/REST/Storage APIs (see
  [testing-status](testing-status.md) for the coverage breakdown). Tests
  only — no production code changed, so no new deploy verification is
  needed beyond WI-0007.
- Every Cursor phase that is currently unblocked has now been executed
  (C1, C2, C3, C5, C7). Remaining phases all wait on Lovable or the owner:
  **C4** ← WI-0006/L3 answer, **C6** ← L2 accounts + L5 re-verify,
  **C8** ← L7 certification data, **C9** ← post-certification backlog.
