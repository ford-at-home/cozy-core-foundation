# Testing status

Joint view of test coverage and execution. Full inventory:
[docs/AUDIT-AND-HARDENING-PLAN.md](../../AUDIT-AND-HARDENING-PLAN.md) §7.
Append attributed entries.

| Layer                        | Status (2026-07-13)                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                   | 147 vitest cases (markdown/print/packet builders, stage model, verification logic, static guards) — passing locally and the only red CI step is unrelated Prettier lint                                                      |
| Component tests              | None exist (documented gap — `docs/ARCHITECTURE.md` → Missing)                                                                                                                                                               |
| Integration tests            | 88 Deno cases over `supabase/functions/_shared/` modules (state machine, credits, Stripe crypto, research chaining, packet/recognition validation) — passing. Edge Function HTTP handlers: zero coverage (planned, phase C5) |
| Playwright                   | Installed (1.61) and used only as the print-fidelity PDF renderer. No E2E config, no app UI tests (planned, phase C9)                                                                                                        |
| Backend tests (live DB)      | `supabase/tests/credits.test.sql` + `credit-concurrency.sh` exist but are unrunnable against Lovable Cloud (no psql/DB password); RLS probe suite planned (phase C6, needs test accounts — L2)                               |
| File-generation tests        | Print/PDF: strong (Chromium fidelity suite with golden-style fixtures). DOCX: none — structural validator + golden file planned (C3 item 4, C5)                                                                              |
| Expensive certification runs | Never performed; `final_docx`/`followup_research` kinds have zero production executions. Planned as L7 + audit P0.10                                                                                                         |
| Demo-user validation         | Not started; blocked on P0 backlog                                                                                                                                                                                           |

## Log

### 2026-07-13 — WI-0001 — Cursor

Initial status seeded from the executed validation suites and the audit.
