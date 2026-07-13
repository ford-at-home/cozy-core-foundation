# Testing status

Joint view of test coverage and execution. Full inventory:
[docs/AUDIT-AND-HARDENING-PLAN.md](../../AUDIT-AND-HARDENING-PLAN.md) §7.
Append attributed entries.

| Layer                        | Status (2026-07-13)                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                   | 147 vitest cases (markdown/print/packet builders, stage model, verification logic, static guards) — passing locally and the only red CI step is unrelated Prettier lint                                                                                                                                     |
| Component tests              | None exist (documented gap — `docs/ARCHITECTURE.md` → Missing)                                                                                                                                                                                                                                              |
| Integration tests            | 151 Deno cases — `_shared/` modules (state machine, credits, Stripe crypto, research chaining, packet/recognition validation, OOXML, page sweep) plus fake-`Request` HTTP handler tests for the six workflow-critical Edge Functions (phase C5, network-free harness in `_tests/helpers/edge.ts`) — passing |
| Playwright                   | Installed (1.61) and used only as the print-fidelity PDF renderer. No E2E config, no app UI tests (planned, phase C9)                                                                                                                                                                                       |
| Backend tests (live DB)      | `supabase/tests/credits.test.sql` + `credit-concurrency.sh` exist but are unrunnable against Lovable Cloud (no psql/DB password); RLS probe suite planned (phase C6, needs test accounts — L2)                                                                                                              |
| File-generation tests        | Print/PDF: strong (Chromium fidelity suite with golden-style fixtures). DOCX: none — structural validator + golden file planned (C3 item 4, C5)                                                                                                                                                             |
| Expensive certification runs | Never performed; `final_docx`/`followup_research` kinds have zero production executions. Planned as L7 + audit P0.10                                                                                                                                                                                        |
| Demo-user validation         | Not started; blocked on P0 backlog                                                                                                                                                                                                                                                                          |

## Log

### 2026-07-13 — phase C5 — Cursor

Edge Function HTTP handler coverage added (audit P1.3). A new harness
(`supabase/functions/_tests/helpers/edge.ts`) captures each function's
`Deno.serve` handler and stubs the Supabase Auth/REST/Storage HTTP APIs
in-process; any unscripted external fetch throws. 41 new cases across
`start-workflow`, `create-student-return-upload`, `analyze-returned-page`,
`verify-student-responses`, `run-follow-up-research`, and
`create-final-document-job`: auth rejection, ownership rejection,
`requestId` idempotency replay, insert-race fallback (P1.4), credit gates,
prerequisite 4xx codes, stub-provider dispatch, and the P0.5 stranding
guard. Deno suite total: 151 passing. The test command now needs
`--allow-read=supabase/functions` (dynamic handler imports) — updated in
`package.json` and CI.

### 2026-07-13 — WI-0001 — Cursor

Initial status seeded from the executed validation suites and the audit.
