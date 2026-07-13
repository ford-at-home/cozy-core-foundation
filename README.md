# Hardcopy Tools

**Hardcopy Tools** builds writing tools around a paper loop: *prepare → print
→ think → mark → return*. The first product (provisionally **Hardcopy Draft**)
prepares long-form drafts in your voice from research you paste or that it
researches for you, prints them US-Letter with pen-friendly margins and
`S{n}P{m}` block anchors, and turns your dictated annotations into a final
version. Generation is metered by a credit ledger backed by Stripe Checkout.

This README is the authoritative architecture overview and configuration
inventory. Domain detail lives in one doc per topic — see the skill router in
[AGENTS.md](AGENTS.md):

- Billing and credits: [docs/BILLING.md](docs/BILLING.md)
- Operations and the agent pipeline: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- The synthesize contract cloud agents follow: [contract/README.md](contract/README.md)
- Brand and copy: [docs/brand/](docs/brand/)
- Route conventions: [src/routes/README.md](src/routes/README.md)

## Architecture

| Layer | What it is |
|---|---|
| Frontend | TanStack Start (React 19, file-based routes in `src/routes/`), Tailwind 4, TanStack Query, mobile-first shell with bottom tabs. Brand strings flow from `src/config/brand.ts`. |
| Auth | Supabase auth (email/password + Google) via `@lovable.dev/cloud-auth-js`; `/_authenticated` routes gate on session. |
| Backend | Supabase (Lovable Cloud): Postgres + RLS, Edge Functions (Deno), migrations in `supabase/migrations/`. |
| Edge functions | `start-workflow` (compose / deep research), `piece-action` (resynth / ready / revise), `cursor-webhook` (agent status), `reconcile-runs` (2-min cron: polls runs, sweeps stale credit holds, heals Stripe purchases), `create-checkout-session`, `stripe-webhook`. |
| Execution plane | Cursor cloud agents clone this repo, follow `contract/` (see its README for the three product overrides), and write `pieces/<slug>/…` on a branch; `_shared/complete.ts` fetches results back. Deep research runs on Parallel AI, then chains a compose run. |
| Payments | Stripe Checkout (hosted). `credit_products` maps Stripe **price ids** to credit packs. The signature-verified `stripe-webhook` is the only path from money to credits. |
| Credits | Append-only `credit_ledger` + `credit_accounts` projection. Reserve before dispatch → settle on completion → release on failure. SECURITY DEFINER SQL functions are the only writers; clients get SELECT on their own rows. |
| Print/PDF | Native paged-media pipeline: `src/lib/print-document.ts` inlines `src/styles/print.css` + fonts into a self-contained document; the browser's print engine produces preview, PDF, and paper from one renderer. Anchor counting is contract-pinned to `contract/references/MARKUP.md`. |

### The artifact lifecycle (and where money moves)

```
user request (/new or run actions)
  → auth (JWT + RLS)
  → credit reservation (reserve_credits; 402 if insufficient)
  → dispatch (Cursor agent or Parallel research → chained compose)
  → generation (agent writes pieces/<slug>/… on a branch)
  → fetch-back (awaiting_fetch → completed)
  → SETTLE the reservation (consumption ledger entry)      ← the billable moment
    …or on failure/cancel/stuck: RELEASE the reservation   ← never charged
  → view (run page) / print / Save as PDF                  ← always free
```

- Costs: compose 1, deep-research start 2 (covers the chained compose),
  resynth/ready/revise 1 each. Canonical table:
  `supabase/functions/_shared/credits.ts` (`CREDIT_COST`); the frontend mirror
  `src/lib/use-credits.ts` is enforced by a test.
- Viewing, printing, re-printing, and Save-as-PDF of an existing draft never
  consume credits. Regenerating (resynth / ready / revise / new compose) is a
  new billable generation.
- Retries do not double-charge: reservations are idempotent per run, grants
  are idempotent per ledger key, and the reconciler sweeps stale holds.

## Development

```sh
npm install
npm run dev        # vite dev server
npm run build      # production build
npm run lint
```

### Tests

| Suite | Command | Needs |
|---|---|---|
| Frontend units + print fidelity | `npm test` | Playwright Chromium (`npx playwright install chromium`); PDF artifacts land in `test-artifacts/print/` |
| Edge-function units (credits, webhooks, state machine, prompts) | `npm run test:edge` | [Deno](https://deno.com) |
| SQL ledger invariants | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/credits.test.sql` | Postgres with migrations applied |
| Credit concurrency race | `DATABASE_URL=… supabase/tests/credit-concurrency.sh` | Postgres |

CI (`.github/workflows/ci.yml`) runs lint, the Vitest suite, and the Deno
suite on every push and pull request.

## Configuration inventory

One list, grouped by surface. **Never put secret values in code, git, or any
`VITE_*` variable.**

### Frontend (browser-safe, `VITE_*`, in `.env`)

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/config/backend.ts`, `src/integrations/supabase/client.ts` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same | Supabase publishable (anon) key |

`.env` is Lovable-managed and contains only these publishable values (plus
bare and `*_PROJECT_ID` duplicates Lovable writes; the app reads only the two
above and their bare-name server twins). There is **no** `VITE_` Stripe key —
the browser never talks to Stripe directly.

### App server (TanStack Start SSR / server routes)

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | server routes, SSR Supabase clients | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `client.ts`, `auth-middleware.ts`, `transcribe.ts` | anon key for SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts`, `record-inference.server.ts` | **secret** — service role |
| `LOVABLE_API_KEY` | `transcribe.ts`, `generate-image.ts` | **secret** — AI gateway (operator's workspace allowance, not user credits) |
| `OPENAI_API_KEY` | `generate-image.ts` | **secret** — image-gen fallback |
| `AGENT_IMAGE_SECRET` | `image-token.ts`, `generate-image.ts` | **secret** — per-run image-token HMAC |

### Edge functions (Supabase secrets; Lovable Cloud → backend secrets)

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all functions | injected by Supabase |
| `SUPABASE_ANON_KEY` | `start-workflow`, `piece-action`, `create-checkout-session` | JWT-auth client. **Naming note:** this is the same key the app calls `SUPABASE_PUBLISHABLE_KEY` — Supabase injects it under the `ANON` name in functions. |
| `STRIPE_SECRET_KEY` | `create-checkout-session`, `stripe-webhook`, reconciler | **secret** — Stripe API |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | **secret** — webhook signature |
| `APP_PUBLIC_URL` | `create-checkout-session`, `image-token.ts` | deployed origin for Checkout success/cancel URLs (`/billing?status=…`) |
| `CREDITS_MODE` | `_shared/credits.ts` | `enforce` (default) or `log` — incident lever, meters without blocking |
| `CURSOR_API_KEY` | dispatch, reconciler | **secret** — Cursor cloud agents (unset = stub provider) |
| `CURSOR_WEBHOOK_SECRET` | dispatch, `cursor-webhook` | **secret** — HMAC on agent webhooks |
| `PARALLEL_API_KEY` | `start-workflow`, research | **secret** — deep research (unset = topic mode 422s) |
| `PARALLEL_PROCESSOR` | research | optional depth override |
| `AGENT_MODEL`, `AGENT_REPO_URL`, `AGENT_REPO_REF`, `AGENT_PROVIDER` | dispatch | optional overrides (`AGENT_PROVIDER=stub` is the kill switch) |
| `GITHUB_TOKEN` | `complete.ts` | **secret** — fetch-back if the repo goes private |
| `RECONCILE_TOKEN` | `reconcile-runs` | optional bearer gate on the reconciler |
| `LOVABLE_API_KEY` | `start-workflow` (PDF OCR) | **secret** — see app server note |

### External configuration (not env vars)

| Item | Where | Notes |
|---|---|---|
| Stripe products/prices | Stripe dashboard → `credit_products.stripe_price_id` (SQL) | **Price ids** (`price_…`), not product ids. Seeded rows are `active = false` with placeholder ids until the owner runs the checklist in [docs/BILLING.md](docs/BILLING.md). |
| Stripe webhook endpoint | Stripe dashboard | `…/functions/v1/stripe-webhook`; six event types listed in BILLING.md |
| JWT verification per function | `supabase/config.toml` | webhooks/cron `verify_jwt = false` (they authenticate by signature/token); user-facing functions `true` |
| Reconciler cron | migration `20260711150000_reconciler_cron.sql` | every 2 min via pg_cron + pg_net |

## Repository layout

```
src/                  TanStack Start app (routes, components, lib)
supabase/functions/   Edge functions + _shared/ modules + _tests/ (Deno)
supabase/migrations/  Schema, RLS, credit ledger, cron
supabase/tests/       SQL invariants + concurrency race script
contract/             Vendored synthesize contract the cloud agent follows
docs/                 BILLING, RUNBOOK, brand/, historical plans
tests/                Vitest: markdown, print document, print fidelity (Chromium)
pieces/               Written by cloud agents on their branches (empty on main)
```
