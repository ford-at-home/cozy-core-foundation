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

**Compose** (internal codename; shipping as **Hardcopy Draft** by **Hardcopy
Tools** — see Brand below) — a personal long-form writing pipeline. The
signed-in author submits research (pasted text or a topic for deep research),
cloud agents synthesize proposals/drafts/finals as markdown committed to a
GitHub repo, and the author reviews on screen, prints a wide-margin US Letter
copy for pen markup, then types the annotations back to trigger a revision
run.

A second **workflow** (`pieces.workflow = 'research_packet'`, alongside the
default `'longform'`) turns the same pipeline into a research-and-learning
loop for college students: research → printable packet with tailored Socratic
questions and handwriting space → paper annotation → (later phases) photo/
dictation return, follow-up research, and final Word/PowerPoint artifacts.
Specification set: `docs/research-workflow/`.

## Frontend (verified)

| Concern          | Implementation                                                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | TanStack Start (SSR) + React 19 + Vite 8. Not Next.js, not a plain SPA.                                                                                                                                                                                                                            |
| Routing          | File-based under `src/routes/` (conventions: `src/routes/README.md`). `src/routeTree.gen.ts` is generated — never hand-edit.                                                                                                                                                                       |
| Server state     | TanStack Query + Supabase realtime (`agent_runs`, `pieces`). No Zustand/Redux.                                                                                                                                                                                                                     |
| Server functions | `createServerFn` in `src/lib/*.functions.ts`; server-only helpers in `src/lib/*.server.ts`.                                                                                                                                                                                                        |
| API routes       | `src/routes/api/transcribe.ts` (Lovable AI gateway proxy), `src/routes/api/public/generate-image.ts` (HMAC-token guarded, used by cloud agents).                                                                                                                                                   |
| Styling          | Tailwind v4 CSS-first. All tokens/theme in `src/styles.css` (`@theme inline`); **no `tailwind.config.*`**. Editorial dark theme: warm charcoal + amber primary, Inter + Instrument Serif.                                                                                                          |
| Components       | shadcn/ui (new-york) in `src/components/ui/`; app components `StatusPill`, `MarkdownView`, `RunCostCard`, `CostBadge`, `CreditBalance` (header balance chip → `/billing`) in `src/components/`.                                                                                                                                                        |
| Auth guard       | `src/routes/_authenticated/route.tsx` `beforeLoad` → `supabase.auth.getUser()` → redirect to `/auth`. `ssr: false` for the authenticated tree.                                                                                                                                                     |
| Brand            | All names/messaging come from `src/config/brand.ts` (company "Hardcopy Tools", product "Hardcopy Draft" — provisional). Never hardcode product names in UI copy; use `brand`/`pageTitle`. Voice and copy dispositions: `docs/brand/BRAND.md`, `docs/brand/UI-COPY-MAP.md`, `docs/brand/NAMING.md`. |

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
| `/project/$pieceId`                 | `src/routes/_authenticated/project.$pieceId.tsx` (research-packet guided hub: Research → Print → Think → Return → Review → Follow Up → Finish; stage model derived in `src/lib/packet-stage.ts` from server-persisted rows) |
| `/packet/$runId`                    | `src/routes/_authenticated/packet.$runId.tsx` (research-packet question review: edit / lock / add / approve) |
| `/print/$runId`                     | print-for-markup preview + PDF download (packet runs use the packet builder with response areas) |
| `/billing`                          | `src/routes/_authenticated/billing.tsx` (balance, credit packs, purchase history, ledger, checkout return banners) |

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

- `src/lib/print-document.ts` (`buildPrintDocument`) builds a **self-contained
  HTML document**: markdown rendered via `src/lib/markdown.ts`, `print.css`
  inlined via `?raw`, fonts embedded as data URIs (Source Serif 4 + Source
  Code Pro from `@fontsource`) so pagination is machine-independent, plus a
  per-document running header.
- `src/routes/_authenticated/print.$runId.tsx` renders that document in an
  **isolated iframe** via `srcDoc` (print.css restyles global tags and must
  not leak into the app). Printing and Save-as-PDF both go through the
  browser's native print dialog — **there is no client PDF library**
  (html2pdf.js was removed); the paged-media engine is the single renderer
  for preview, PDF, and paper.
- `src/styles/print.css`: `@page { size: letter; margin: 1.5in 2in 1.5in 0.5in }`
  — the left margin is deliberately **split** (0.5in page margin + 1in body
  padding in print) so the S{n}P{m} anchors stay inside the page content box
  (print engines clip the @page margin area). Serif 12pt, page-break rules,
  folio margin box, and the **S{n}P{m} block-anchor CSS counters**.
- **Sync contract**: the anchor-counting rule in `print.css` must match
  `contract/references/MARKUP.md` ("Pre-Printed Block Anchors") — the revision
  agent resolves "S4P3" annotations with the same rule. Guarded by
  `scripts/check-print-contract.sh` (markers) and proven end-to-end by
  `tests/print-fidelity.test.ts` (real Chromium: rendered anchors vs. the
  reference walker in `tests/anchor-reference.ts`, PDF pagination, page
  furniture; artifacts land in `test-artifacts/print/`).
- `buildPacketPrintDocument` (same file) wraps the same renderer for research
  packets: packet header, MARKUP.md legend, handwriting guidance, question
  blocks with ruled response areas, follow-up section, return instructions —
  all built from `div`/`span` furniture so it consumes **zero** S{n}P{m}
  anchors (the counting rule is untouched). Layout spec:
  `docs/research-workflow/03-printable-packet.md`.
- Everything targets **US Letter**. There is no A4 anywhere.

## Backend — Supabase (verified)

Project id `dlaojinagezrlbwyritd` (`supabase/config.toml`).

### Tables (from `supabase/migrations/`)

| Table                                             | Role                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `profiles`                                        | Per-user voice/style (`style_text`, `image_style`, presets)                                              |
| `pieces`                                          | Content lifecycle (stage, slug, PR URLs)                                                                 |
| `agent_runs`                                      | Canonical job rows: status machine, `idempotency_key` (unique), external agent ids, cost rollups         |
| `agent_run_events`                                | Append-only audit + webhook dedup (partial unique on `(run_id, external_event_id)`)                      |
| `sessions`                                        | Cost rollup per piece (unique `sessions(piece_id)`)                                                      |
| `model_pricing`                                   | Versioned provider pricing                                                                               |
| `inferences`                                      | Billable units; unique `(provider, idempotency_key)`                                                     |
| `provider_usage_events`                           | Raw usage audit trail                                                                                    |
| `credit_accounts`                                 | Balance projection per user: `SUM(ledger) − held reservations`                                           |
| `credit_ledger`                                   | **Append-only** credit history; corrections are new rows, never edits                                    |
| `credit_reservations`                             | Holds placed at dispatch; settled on completion, released on failure/sweep                               |
| `credit_products`                                 | Purchasable packs; checkout validates client-sent price ids against this table                           |
| `purchases`, `billing_customers`, `subscriptions` | Stripe object mirrors (Stripe stays the source of truth for payment state)                               |
| `stripe_events`                                   | Webhook inbox, PK = Stripe event id (duplicate delivery = no-op insert); RLS deny-all, service-role only |
| `packets`                                         | One row per completed packet run (`workflow='research_packet'`): analysis jsonb, status `generated → reviewed`; unique `run_id` |
| `packet_questions`                                | Tailored Socratic questions per packet; question text/lock are owner-editable content under RLS; unique `(packet_id, position)` |
| `packet_returns`                                  | One return attempt per printed packet (status tracks the upload lifecycle: `pending → uploading → recognizing → ready`/`failed`); created by `create-student-return-upload`; client grant is SELECT-only |
| `page_images`                                     | Uploaded page photos (private `packet-returns` bucket); `uploaded → analyzing → analyzed`/`failed` written by `analyze-returned-page`; client grant is SELECT-only |
| `recognized_blocks`                               | Raw handwriting-recognition output per page (append-only); service-role writes only, owner reads |
| `dictation_segments`                              | Dictated response transcripts with `resolved_target` jsonb; written via `submit-dictation`; client grant is SELECT-only |
| `verification_corrections`                        | Append-only student-approved final text per block/segment, written via `verify-student-responses`; latest row per target wins |
| `followup_questions`                              | Up to 3 follow-up research questions per packet (unique `(packet_id, position)`); `submitted → refined → approved → researched`; written via `prepare-follow-up-questions` |
| `final_artifacts`                                 | Generated Word/PowerPoint artifacts (`final-artifacts` bucket); `pending → generating → ready`/`failed`; service-role writes, owner downloads via signed URL |
| `pieces.workflow_stage` + `piece_events`          | Backend FSM (`advance_workflow_stage`, service-role only) + packet-level audit trail; the hub UI derives its stage from rows, not this column (see `src/lib/packet-stage.ts`) |

RLS: users read/write their own rows where user-editable (profiles, sessions,
inferences); **INSERT/UPDATE/DELETE on `pieces`/`agent_runs` are revoked for
`authenticated`** (bugbash hardening +
`20260712170000_revoke_client_run_insert.sql`) — all mutations to controller
tables go through Edge Functions with the service role, so a credit
reservation always precedes a run's existence. `model_pricing` is read-only to
signed-in users. Storage bucket `research-attachments` is scoped to the
`auth.uid()/` folder prefix.

Triggers: `recompute_run_totals` / `recompute_session_totals` roll `inferences`
costs up to `agent_runs` and `sessions`. Never write totals directly.

### Edge Functions (`supabase/functions/`)

| Function                  | Auth (config.toml)                                                     | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `start-workflow`          | JWT required                                                           | Create piece + run, reserve credits, dispatch Cursor agent or research             |
| `piece-action`            | JWT required + explicit `piece.user_id` ownership check                | `resynth` / `ready` / `revise` actions (credit-reserving where billable)           |
| `cursor-webhook`          | `verify_jwt = false`; HMAC-SHA256 over raw body (`_shared/webhook.ts`) | Cursor `statusChange` receiver                                                     |
| `reconcile-runs`          | `verify_jwt = false`; optional `RECONCILE_TOKEN` bearer                | pg_cron sweep: completes runs, settles/releases credits, sweeps stale reservations |
| `create-checkout-session` | JWT required                                                           | Server-created Stripe Checkout; validates price ids against `credit_products`      |
| `stripe-webhook`          | `verify_jwt = false`; Stripe signature verification                    | Sole grantor of purchased credits; `stripe_events` inbox dedup                     |
| `create-student-return-upload` | JWT required + packet ownership check                             | Creates `packet_returns` + `page_images` rows, returns signed upload URLs (≤20 pages) |
| `analyze-returned-page`   | JWT required + page ownership check                                    | Handwriting extraction via Lovable AI Gateway; writes `recognized_blocks`; idempotent per analyzed page |
| `submit-dictation`        | JWT required + packet ownership check                                  | Persists a dictation transcript (`dictation_segments`); transcription itself happens via `/api/transcribe` |
| `verify-student-responses` | JWT required + piece ownership check                                  | Writes append-only `verification_corrections` (≤500)                               |
| `prepare-follow-up-questions` | JWT required + packet ownership check                              | Stores 1–3 follow-up questions with optional AI refinement suggestions (never overwrites the student's wording) |
| `run-follow-up-research`  | JWT required; **2 credits** reserved before dispatch                    | Focused research on approved follow-ups; fetch-back writes a NEW `packets` row (v+1) |
| `create-final-document-job` | JWT required; **2 credits** reserved before dispatch                  | Final Word document run (`kind='final_docx'`); binary fetch-back into `final-artifacts` |
| `create-presentation-job` | JWT required; **2 credits** reserved before dispatch                    | Final PowerPoint run (`kind='final_pptx'`); binary fetch-back into `final-artifacts` |

Contracts for the eight research-workflow functions:
`docs/research-workflow/BACKEND-CONTRACTS.md`.

Shared modules in `supabase/functions/_shared/`: `state.ts` (run state machine),
`dispatch.ts` (insert-before-dispatch, `dispatch_unknown` on ambiguity),
`complete.ts` (monotonic completion + GitHub fetch-back), `usage.ts`
(idempotent `recordInference`), `credits.ts` (reserve/settle/release/sweep),
`billing.ts` (refund reversal), `stripe-reconcile.ts` (re-checks Stripe for
missed webhooks), `prompt.ts` (cloud-agent prompt builders, including
`buildPacketPrompt`), `packet.ts` (packet JSON validation + idempotent
persistence into `packets`/`packet_questions`, called before a packet run is
marked completed), `webhook.ts`, `parallel.ts`, `research.ts`,
`provider.cursor.ts`, `provider.stub.ts`, `observability.ts`.

### Run state machine (verified — `_shared/state.ts`)

`requested → dispatching → (queued|running|dispatch_unknown) → awaiting_fetch →
completed | failed | cancelled`. Transitions are whitelisted; late or
out-of-order webhooks can never regress a run. Unknown external statuses map to
`null` (hold), never to a terminal state. Tested in
`supabase/functions/_tests/state.test.ts`.

### Cost accounting (verified)

USD **cost accounting** for provider spend (separate from user credits below):

- One `inferences` row per billable unit, upserted on
  `(provider, idempotency_key)` so webhook redelivery/re-polling never
  double-records. Key shapes: `cursor:{external_agent_id}:complete`,
  `lovable:ocr:{runId}:{path}`, `image:{runId}:{promptHash}`.
- Pricing precedence: `provider_reported → fixed_task_price → calculated →
estimated → manual` (`_shared/usage.ts` `computeCost`).
- Rollups happen in DB triggers only.
- Lovable workspace AI credits are **external**; the app only surfaces the
  gateway's 402 ("Out of AI credits") in `/api/transcribe` and `profile.tsx`.

### Credits and Stripe billing (verified — read `docs/BILLING.md` before touching)

User-facing credits (1 credit = 1 completed generation; research = 2):

- **Append-only ledger** (`credit_ledger`); `credit_accounts.balance` is a
  projection. All balance mutation goes through SECURITY DEFINER Postgres
  functions (`grant_credits`, `reserve_credits`, `settle_reservation`,
  `release_reservation`, `admin_adjust_credits`) executable only by
  `service_role` — defined in
  `supabase/migrations/20260712140000_credit_ledger.sql`.
- Reserve at dispatch → settle on completion → release on failure/cancel;
  `sweepStaleReservations` in the reconciler recovers stuck holds
  (`_shared/credits.ts`).
- **Credits are granted only by the verified Stripe webhook** (or
  `stripe-reconcile.ts` re-checking Stripe). The `/billing?status=success`
  redirect grants nothing.
- The client never submits prices; `create-checkout-session` validates price
  ids against `credit_products`. The frontend has **no Stripe key**.
- Frontend billing surface: `src/routes/_authenticated/billing.tsx` (packs,
  history, checkout return banners — display only), `src/components/CreditBalance.tsx`
  (header chip), `src/lib/use-credits.ts` (balance query + realtime,
  `CREDIT_COST` mirror, paywall error detection),
  `src/lib/billing.functions.ts` (server fn → `create-checkout-session`).
- `CREDITS_MODE=log` is the incident lever (observe without blocking).
- Tests: `supabase/functions/_tests/credits.test.ts` +
  `_tests/stripe-webhook.test.ts` (Deno), `tests/billing-boundaries.test.ts`
  (client/server drift guards),
  `supabase/tests/credits.test.sql` + `supabase/tests/credit-concurrency.sh`
  (SQL invariants, need a live database).
- Money rules, secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and the
  owner's manual Stripe checklist: `docs/BILLING.md`.

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
- The **complete** environment/configuration inventory (every variable, where
  it is read, which are secrets): `docs/CONFIGURATION.md`.
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

| Check                                | Command                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Lint                                 | `npm run lint`                                                                   |
| Typecheck                            | `npm run typecheck`                                                              |
| Frontend/print tests (vitest)        | `npm test` (print-fidelity needs Chromium: `npx playwright install chromium`)    |
| Build                                | `npm run build`                                                                  |
| Edge function tests                  | `deno test --allow-env supabase/functions/_tests/` (or `npm run test:functions`) |
| Secret scan                          | `bash scripts/check-secrets.sh`                                                  |
| Migration RLS check                  | `bash scripts/check-migrations.sh`                                               |
| Print contract sync                  | `bash scripts/check-print-contract.sh`                                           |
| Credit SQL invariants (live DB only) | `supabase/tests/credits.test.sql`, `supabase/tests/credit-concurrency.sh`        |

CI runs all of the above except the live-DB credit tests:
`.github/workflows/ci.yml`.

## Missing (verified absent — do not invent)

- **Frontend component/UI test suite** — vitest covers the markdown/print
  pipeline plus static cross-feature guards (`tests/agent-os.test.ts` for
  skill/doc references, `tests/billing-boundaries.test.ts` for billing drift);
  there are no React component or route tests. UI validation is
  lint + typecheck + build + manual viewport checks.
- **GitHub App integration** (issue threads, labels) — deferred by design
  (`docs/RUNBOOK.md`).

## External (cannot be inspected or changed from this repository)

- Lovable Cloud hosting, backend secrets, and workspace AI credits.
- Supabase dashboard state (applied migrations, cron jobs, deployed functions).
- The Stripe dashboard (products, prices, webhook endpoints, test/live mode) —
  the owner's checklist is in `docs/BILLING.md`.
- Cursor platform (cursor.com/agents), Parallel platform (platform.parallel.ai).
- The GitHub repository that content agents commit pieces to.

Never claim work in these systems was completed. Document the exact manual
steps instead (see `docs/RUNBOOK.md` and `docs/BILLING.md` for the
established format).
