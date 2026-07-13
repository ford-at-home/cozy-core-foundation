# Configuration inventory

The single authoritative list of every environment variable and piece of
external configuration this application uses, verified against the code on
2026-07-12. Other documents (RUNBOOK, BILLING, ARCHITECTURE) link here rather
than maintaining their own lists. **Never put secret values in the repo, in
`VITE_*` variables, or in this file.**

## Client bundle (VITE_* — publishable by design, ship in the browser)

| Variable                        | Read by                               | Purpose                       |
| ------------------------------- | ------------------------------------- | ----------------------------- |
| `VITE_SUPABASE_URL`             | `src/integrations/supabase/client.ts` | Supabase project URL          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/client.ts` | Supabase anon/publishable key |

The frontend has **no Stripe key**: checkout is a redirect to a
server-created, Stripe-hosted URL (`docs/BILLING.md`).

## SSR / Nitro server (process.env — server-side only)

| Variable                    | Read by                                                                            | Secret? | Purpose                                   |
| --------------------------- | ---------------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| `SUPABASE_URL`              | `client.ts` (SSR fallback), `client.server.ts`, auth middleware                    | no      | Supabase project URL                      |
| `SUPABASE_PUBLISHABLE_KEY`  | `client.ts` (SSR fallback), auth middleware                                        | no      | Supabase anon/publishable key             |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/integrations/supabase/client.server.ts`, `src/lib/record-inference.server.ts` | **yes** | Admin client for server-only helpers      |
| `LOVABLE_API_KEY`           | `src/routes/api/transcribe.ts`, `src/routes/api/public/generate-image.ts`          | **yes** | Lovable AI gateway (dictation, image gen) |
| `OPENAI_API_KEY`            | `src/routes/api/public/generate-image.ts`                                          | **yes** | Image generation fallback provider        |
| `AGENT_IMAGE_SECRET`        | `src/routes/api/public/generate-image.ts`                                          | **yes** | HMAC secret for per-run image tokens      |

## Edge Functions (Deno.env — set in Lovable Cloud backend secrets)

### Supabase platform (provided automatically)

| Variable                    | Purpose                          |
| --------------------------- | -------------------------------- |
| `SUPABASE_URL`              | Project URL                      |
| `SUPABASE_ANON_KEY`         | JWT validation in user functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role writes (**secret**) |

### Stripe / billing (`docs/BILLING.md` for setup order — test mode first)

| Variable                | Read by                                                                         | Secret? | Purpose                                                                |
| ----------------------- | ------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | `create-checkout-session`, `stripe-webhook`, reconciler (`stripe-reconcile.ts`) | **yes** | Server-side Stripe API (`sk_test_…` before `sk_live_…`)                |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook`                                                                | **yes** | Signature verification (`whsec_…`, per endpoint per mode)              |
| `APP_PUBLIC_URL`        | `create-checkout-session`                                                       | no      | Deployed origin for Checkout success/cancel URLs (`/billing?status=…`) |
| `CREDITS_MODE`          | `_shared/credits.ts`                                                            | no      | `enforce` (default) or `log` — the incident rollback lever             |

Stripe **price ids** are not environment variables: they live in the
`credit_products` table (the code requires `price_…` ids, not product ids —
see the owner checklist in `docs/BILLING.md`).

### Agent orchestration

| Variable                            | Read by                                                 | Secret? | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `CURSOR_API_KEY`                    | `_shared/provider.cursor.ts`, reconciler                | **yes** | Cursor cloud-agent API (unset = stub provider / kill switch)              |
| `CURSOR_WEBHOOK_SECRET`             | `cursor-webhook`                                        | **yes** | HMAC verification (unset = webhooks off; reconciler still completes runs) |
| `AGENT_PROVIDER`                    | `_shared/dispatch.ts`, reconciler                       | no      | `cursor` (default) or `stub`                                              |
| `AGENT_MODEL`                       | `_shared/provider.cursor.ts`                            | no      | Model override for content agents                                         |
| `AGENT_REPO_URL` / `AGENT_REPO_REF` | `_shared/dispatch.ts`, `start-workflow`, `piece-action` | no      | Target repo for content-agent commits                                     |
| `GITHUB_TOKEN`                      | `_shared/complete.ts`                                   | **yes** | Fetch-back of committed content                                           |
| `PARALLEL_API_KEY`                  | `_shared/parallel.ts`, `start-workflow`                 | **yes** | Deep research provider                                                    |
| `PARALLEL_PROCESSOR`                | `_shared/parallel.ts`                                   | no      | Research processor tier                                                   |
| `LOVABLE_API_KEY`                   | `start-workflow` (PDF OCR)                              | **yes** | Lovable gateway from edge functions                                       |
| `AGENT_IMAGE_SECRET`                | `_shared/prompt.ts`                                     | **yes** | Must match the SSR value (token mint + verify)                            |
| `RECONCILE_TOKEN`                   | `reconcile-runs`                                        | **yes** | Optional bearer gate for manual reconciler calls                          |

## CI (`.github/workflows/ci.yml`)

Build uses publishable values only: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` (repo variable or placeholder).

## External configuration (not env vars — cannot be set from this repo)

- **Stripe dashboard**: products/prices (one-time, USD), webhook endpoint
  `…/functions/v1/stripe-webhook` with the six event types, signing secret —
  `docs/BILLING.md` owner checklist.
- **Supabase dashboard / Lovable Cloud**: applied migrations, deployed
  functions, pg_cron schedule for `reconcile-runs`, auth settings (email
  confirmation + captcha reduce free-credit farming), backend secrets above —
  `docs/RUNBOOK.md`.
- **`credit_products` rows**: seeded inactive with `price_REPLACE_*`
  placeholders; the owner activates them with real price ids via SQL.
- `https://hardcopy.tools/og-image.png` is referenced in meta tags but hosted
  outside this repo.

## Known non-standard items

- `src/lib/admin.functions.ts` (a demo admin bootstrap with a hardcoded
  password, unused by any route) was removed in the post-merge
  reconciliation; do not reintroduce it.
- Duplicate naming `VITE_SUPABASE_*` (client) vs `SUPABASE_*` (SSR) is by
  design: Vite only exposes `VITE_`-prefixed values to the browser bundle,
  and `scripts/check-secrets.sh` scans the built assets for leaks.
