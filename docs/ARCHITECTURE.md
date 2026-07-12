# Architecture Map

Verified against the repository on 2026-07-12. Every claim below is labeled:

- **Verified** — read directly from repository code.
- **Partial** — exists but incomplete or unused.
- **Missing** — does not exist in this repository (do not invent it).
- **External** — lives outside the repository (Lovable Cloud, Supabase dashboard,
  Cursor/Parallel platforms) and cannot be inspected or changed from here.

This file is the starting point for `repository-orientation`
(`.cursor/skills/repository-orientation/SKILL.md`). If you change the
architecture, update this map in the same PR.

## What this application is

**Compose** — a personal long-form writing pipeline. The signed-in author
submits research (pasted text or a topic for deep research), cloud agents
synthesize proposals/drafts/finals as markdown committed to a GitHub repo, and
the author reviews on screen, prints a wide-margin US Letter copy for pen
markup, then types the annotations back to trigger a revision run.

## Frontend (verified)

| Concern          | Implementation                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | TanStack Start (SSR) + React 19 + Vite 8. Not Next.js, not a plain SPA.                                                                                                                   |
| Routing          | File-based under `src/routes/` (conventions: `src/routes/README.md`). `src/routeTree.gen.ts` is generated — never hand-edit.                                                              |
| Server state     | TanStack Query + Supabase realtime (`agent_runs`, `pieces`). No Zustand/Redux.                                                                                                            |
| Server functions | `createServerFn` in `src/lib/*.functions.ts`; server-only helpers in `src/lib/*.server.ts`.                                                                                               |
| API routes       | `src/routes/api/transcribe.ts` (Lovable AI gateway proxy), `src/routes/api/public/generate-image.ts` (HMAC-token guarded, used by cloud agents).                                          |
| Styling          | Tailwind v4 CSS-first. All tokens/theme in `src/styles.css` (`@theme inline`); **no `tailwind.config.*`**. Editorial dark theme: warm charcoal + amber primary, Inter + Instrument Serif. |
| Components       | shadcn/ui (new-york) in `src/components/ui/`; app components `StatusPill`, `MarkdownView`, `RunCostCard`, `CostBadge` in `src/components/`.                                               |
| Auth guard       | `src/routes/_authenticated/route.tsx` `beforeLoad` → `supabase.auth.getUser()` → redirect to `/auth`. `ssr: false` for the authenticated tree.                                            |

### Pages (verified)

| URL                                 | File                                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| `/`                                 | `src/routes/index.tsx` (landing)                                  |
| `/auth`                             | `src/routes/auth.tsx` (email/password + Google via Lovable)       |
| `/dashboard`                        | `src/routes/_authenticated/dashboard.tsx`                         |
| `/new`                              | `src/routes/_authenticated/new.tsx` (paste research or topic)     |
| `/profile`                          | `src/routes/_authenticated/profile.tsx` (voice/style + dictation) |
| `/sessions`, `/sessions/$sessionId` | cost views                                                        |
| `/runs/$runId`                      | run detail, outputs, actions (ready / resynth / revise)           |
| `/print/$runId`                     | print-for-markup preview + PDF download                           |

### Mobile (verified — mobile is the primary interface)

- Bottom tab nav (`sm:hidden`) + desktop header (`hidden sm:flex`) in
  `src/routes/_authenticated/route.tsx`.
- Safe areas: `env(safe-area-inset-*)` insets; content bottom padding
  `pb-[calc(5.5rem+env(safe-area-inset-bottom))]` clears the tab bar.
- Touch targets: `min-h-11` (44px) on interactive elements.
- 16px font-size on inputs under 768px (`src/styles.css`) to prevent iOS zoom.
- Card-list on mobile / table on `md+` (see `sessions.tsx`).
- `useIsMobile` hook exists (`src/hooks/use-mobile.tsx`, 768px breakpoint) —
  **partial**: only consumed by the unused shadcn sidebar. Prefer Tailwind
  responsive classes, as the rest of the app does.

## Print and PDF (verified)

- `src/routes/_authenticated/print.$runId.tsx` renders the run's `post.md`
  through markdown-it into an **isolated iframe** via `srcDoc`, importing
  `src/styles/print.css?raw`. The iframe exists because print.css restyles
  global tags and must not leak into the app.
- `src/styles/print.css`: `@page { size: letter; margin: 1.5in 2in 1.5in 1.5in }`,
  serif 12pt, page-break rules, and the **S{n}P{m} block-anchor CSS counters**
  (`body.with-anchors`).
- **Sync contract**: the anchor-counting rule in `print.css` must match
  `contract/references/MARKUP.md` ("Pre-Printed Block Anchors") — the revision
  agent resolves "S4P3" annotations with the same rule. Enforced by
  `scripts/check-print-contract.sh`.
- PDF: `html2pdf.js` (html2canvas + jsPDF) from the already-rendered iframe
  body, `format: "letter"`, margins `[1.5, 2, 1.5, 1.5]` inches,
  `pagebreak: { mode: ["avoid-all", "css", "legacy"] }`.
- Everything targets **US Letter**. There is no A4 anywhere.

## Backend — Supabase (verified)

Project id `dlaojinagezrlbwyritd` (`supabase/config.toml`).

### Tables (from `supabase/migrations/`, 17 files)

| Table                   | Role                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `profiles`              | Per-user voice/style (`style_text`, `image_style`, presets)                                      |
| `pieces`                | Content lifecycle (stage, slug, PR URLs)                                                         |
| `agent_runs`            | Canonical job rows: status machine, `idempotency_key` (unique), external agent ids, cost rollups |
| `agent_run_events`      | Append-only audit + webhook dedup (partial unique on `(run_id, external_event_id)`)              |
| `sessions`              | Cost rollup per piece (unique `sessions(piece_id)`)                                              |
| `model_pricing`         | Versioned provider pricing                                                                       |
| `inferences`            | Billable units; unique `(provider, idempotency_key)`                                             |
| `provider_usage_events` | Raw usage audit trail                                                                            |

RLS: users SELECT/INSERT their own rows; **UPDATE on `pieces`/`agent_runs` is
revoked for `authenticated`** (bugbash hardening migration) — all mutations go
through Edge Functions with the service role. `model_pricing` is read-only to
signed-in users. Storage bucket `research-attachments` is scoped to the
`auth.uid()/` folder prefix.

Triggers: `recompute_run_totals` / `recompute_session_totals` roll `inferences`
costs up to `agent_runs` and `sessions`. Never write totals directly.

### Edge Functions (`supabase/functions/`)

| Function         | Auth (config.toml)                                                     | Purpose                                                            |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `start-workflow` | JWT required                                                           | Create piece + run, dispatch Cursor agent or Parallel research     |
| `piece-action`   | JWT required + explicit `piece.user_id` ownership check                | `resynth` / `ready` / `revise` actions                             |
| `cursor-webhook` | `verify_jwt = false`; HMAC-SHA256 over raw body (`_shared/webhook.ts`) | Cursor `statusChange` receiver                                     |
| `reconcile-runs` | `verify_jwt = false`; optional `RECONCILE_TOKEN` bearer                | pg_cron sweep of non-terminal runs (authoritative completion path) |

Shared modules in `supabase/functions/_shared/`: `state.ts` (run state machine),
`dispatch.ts` (insert-before-dispatch, `dispatch_unknown` on ambiguity),
`complete.ts` (monotonic completion + GitHub fetch-back), `usage.ts`
(idempotent `recordInference`), `prompt.ts` (cloud-agent prompt builders),
`webhook.ts`, `parallel.ts`, `research.ts`, `provider.cursor.ts`,
`provider.stub.ts`, `observability.ts`.

### Run state machine (verified — `_shared/state.ts`)

`requested → dispatching → (queued|running|dispatch_unknown) → awaiting_fetch →
completed | failed | cancelled`. Transitions are whitelisted; late or
out-of-order webhooks can never regress a run. Unknown external statuses map to
`null` (hold), never to a terminal state. Tested in
`supabase/functions/_tests/state.test.ts`.

### Cost accounting (verified — this is the money-adjacent subsystem)

There is **no credit ledger, no Stripe, no payments** (missing — see below).
What exists is USD **cost accounting**:

- One `inferences` row per billable unit, upserted on
  `(provider, idempotency_key)` so webhook redelivery/re-polling never
  double-records. Key shapes: `cursor:{external_agent_id}:complete`,
  `lovable:ocr:{runId}:{path}`, `image:{runId}:{promptHash}`.
- Pricing precedence: `provider_reported → fixed_task_price → calculated →
estimated → manual` (`_shared/usage.ts` `computeCost`).
- Rollups happen in DB triggers only.
- Lovable workspace AI credits are **external**; the app only surfaces the
  gateway's 402 ("Out of AI credits") in `/api/transcribe` and `profile.tsx`.

## Auth and secrets (verified)

- Browser client: `src/integrations/supabase/client.ts` —
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable; safe).
- Server admin client: `src/integrations/supabase/client.server.ts` —
  `SUPABASE_SERVICE_ROLE_KEY`. Server-only; must never be imported by client code.
- Server-fn auth: `src/integrations/supabase/auth-middleware.ts`
  (`requireSupabaseAuth`) + `auth-attacher.ts` registered in `src/start.ts`.
- Edge Function secrets (external — set in Lovable Cloud backend, per
  `docs/RUNBOOK.md`): `CURSOR_API_KEY`, `CURSOR_WEBHOOK_SECRET`,
  `PARALLEL_API_KEY`, `LOVABLE_API_KEY`, `GITHUB_TOKEN`, `AGENT_IMAGE_SECRET`,
  `RECONCILE_TOKEN`, `AGENT_MODEL` / `AGENT_REPO_URL` / `AGENT_REPO_REF`.
- `src/lib/admin.functions.ts` contains a demo admin bootstrap with a
  hardcoded password — known debt, do not extend it.
- `scripts/check-secrets.sh` scans source and built assets for secret leakage.

## Content contract (verified — for cloud _content_ agents, not implementation agents)

`contract/` is the vendored synthesize contract that **product** cloud agents
(the ones writing prose) follow: `contract/SKILL.md`,
`contract/references/MARKUP.md` (annotation protocol),
`contract/README.md` (three overrides). Implementation agents working on this
codebase do not follow `contract/SKILL.md`; they follow `AGENTS.md` and
`.cursor/skills/`. Prompts sent to content agents are built in
`supabase/functions/_shared/prompt.ts`.

## Validation commands (verified)

| Check               | Command                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| Lint                | `npm run lint`                                                                   |
| Typecheck           | `npm run typecheck`                                                              |
| Build               | `npm run build`                                                                  |
| Edge function tests | `deno test --allow-env supabase/functions/_tests/` (or `npm run test:functions`) |
| Secret scan         | `bash scripts/check-secrets.sh`                                                  |
| Migration RLS check | `bash scripts/check-migrations.sh`                                               |
| Print contract sync | `bash scripts/check-print-contract.sh`                                           |

CI runs all of the above: `.github/workflows/ci.yml`.

## Missing (verified absent — do not invent)

- **Stripe / payments / checkout / credit ledger** — no integration exists.
  If billing is ever added, create `stripe-billing-change` and
  `credit-ledger-change` skills; until then the closest analog is
  `run-orchestration-change` (idempotency + append-only accounting).
- **Frontend test suite** — no vitest/playwright/cypress. Validation is
  lint + typecheck + build + manual viewport checks.
- **Browser automation / screenshot tooling** — none in-repo.
- **GitHub App integration** (issue threads, labels) — deferred by design
  (`docs/RUNBOOK.md`).

## External (cannot be inspected or changed from this repository)

- Lovable Cloud hosting, backend secrets, and workspace AI credits.
- Supabase dashboard state (applied migrations, cron jobs, deployed functions).
- Cursor platform (cursor.com/agents), Parallel platform (platform.parallel.ai).
- The GitHub repository that content agents commit pieces to.

Never claim work in these systems was completed. Document the exact manual
steps instead (see `docs/RUNBOOK.md` for the established format).
