<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Hardcopy Tools — agent guide

This repository is **Hardcopy Tools** (first product: **Hardcopy Draft**): a
TanStack Start + Supabase app that prepares long-form drafts in the user's
voice, prints them for pen markup, and turns dictated annotations into a final
version. Generation is metered by a credit ledger backed by Stripe Checkout.

Start with [README.md](README.md) for the verified architecture map,
configuration inventory, and test commands.

## Skill router

Each domain has one authoritative document. Route yourself by the boundary a
task touches — and read **every** relevant document, not just the most obvious
one.

| Domain | Authoritative doc | Key code |
|---|---|---|
| Payments, credits, ledger, refunds | [docs/BILLING.md](docs/BILLING.md) | `supabase/functions/_shared/credits.ts`, `supabase/functions/stripe-webhook/`, `supabase/migrations/20260712140000_credit_ledger.sql` |
| Agent pipeline, edge functions, reconciler, ops | [docs/RUNBOOK.md](docs/RUNBOOK.md) | `supabase/functions/`, `supabase/functions/_shared/state.ts` |
| Print, PDF, markup contract, anchors | [contract/README.md](contract/README.md) + [contract/references/MARKUP.md](contract/references/MARKUP.md) | `src/lib/print-document.ts`, `src/styles/print.css`, `tests/print-fidelity.test.ts` |
| Synthesize contract (what cloud agents follow) | [contract/SKILL.md](contract/SKILL.md) with the overrides in [contract/README.md](contract/README.md) | `supabase/functions/_shared/prompt.ts` |
| Brand, naming, UI copy | [docs/brand/BRAND.md](docs/brand/BRAND.md), [docs/brand/NAMING.md](docs/brand/NAMING.md), [docs/brand/UI-COPY-MAP.md](docs/brand/UI-COPY-MAP.md) | `src/config/brand.ts` |
| Frontend routing conventions | [src/routes/README.md](src/routes/README.md) | `src/routes/` |
| Configuration and environment variables | [README.md](README.md) (Configuration inventory) | `supabase/config.toml`, `.env` |

### Multi-skill rule

**When a task touches more than one architectural boundary, use every relevant
skill — not only the most obvious one.** Before making changes, state which
docs you selected, why each applies, and which validation steps each imposes.

Common crossings:

| Task | Required reading |
|---|---|
| Modify artifact/draft generation | RUNBOOK (pipeline + state machine) + BILLING (reserve/settle/release boundaries) + contract/README |
| Change checkout, paywall, or billing UI | BILLING + brand docs (UI-COPY-MAP tone rules) |
| Add a new billable action | BILLING (`CREDIT_COST` in `_shared/credits.ts` **and** its mirror `src/lib/use-credits.ts`) + RUNBOOK + brand docs for copy |
| Change the billing schema | BILLING + RUNBOOK + `supabase/migrations/` (append-only ledger invariants) |
| Touch print output or MARKUP anchors | contract/README + MARKUP.md + `src/styles/print.css` (the counting rules must stay in sync; `npm test` pins them) |
| Change landing or pricing copy | brand docs + BILLING (copy must match the implemented credit model) |
| Prepare a release | README (test commands) + BILLING (Stripe checklist) + RUNBOOK (secrets, cron) |

### Invariants that cross boundaries

- **Money → credits only via the Stripe webhook.** The `/billing?status=success`
  redirect is cosmetic; never grant from the client.
- **Reserve before dispatch; settle on success; release on failure.** Printing,
  re-printing, and Save-as-PDF of an existing draft never consume credits.
- `CREDIT_COST` lives in `supabase/functions/_shared/credits.ts`; the frontend
  mirror in `src/lib/use-credits.ts` must match (a Vitest test enforces this).
- The `S{n}P{m}` anchor counting rule must be identical in
  `contract/references/MARKUP.md`, `src/styles/print.css`, and
  `tests/anchor-reference.ts` (print-fidelity tests enforce this).
- Brand strings flow from `src/config/brand.ts`; do not hard-code product names.

## Test commands

| Suite | Command | Needs |
|---|---|---|
| Frontend + print fidelity (Vitest) | `npm test` | Playwright Chromium (`npx playwright install chromium`) |
| Edge-function unit tests (Deno) | `npm run test:edge` (= `deno test --allow-env supabase/functions/_tests/`) | Deno |
| SQL ledger invariants | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/credits.test.sql` | Postgres with migrations applied |
| Credit concurrency race | `DATABASE_URL=... supabase/tests/credit-concurrency.sh` | Postgres |
| Lint | `npm run lint` | — |
