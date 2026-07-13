# Post-merge architecture reconciliation — 2026-07-12

Several branches were developed in isolation and merged cleanly at the Git
level: the print/PDF fidelity pipeline (#8), the Stripe payments and credit
system (#10), the mobile UI polish pass (#7), the Hardcopy Tools brand layer
(#11), and the agent operating system (#9). This document records the
post-merge audit: the verified architecture, where the independently built
features failed to acknowledge one another, and what was changed to align
them. The merged code was treated as the source of truth — not the original
PR descriptions.

This is a point-in-time audit record. For the current architecture, always
read [ARCHITECTURE.md](ARCHITECTURE.md); for billing, [BILLING.md](BILLING.md);
for configuration, [CONFIGURATION.md](CONFIGURATION.md).

## 1. Verified architecture map

| Area | Status | Where it lives |
| --- | --- | --- |
| Frontend framework | Implemented | React 19 + TanStack Start, file-based routes in `src/routes/`, React Query for data |
| Routing | Implemented | `src/routeTree.gen.ts` (generated); `_authenticated` layout gates protected routes |
| Authentication | Implemented | Supabase Auth (email/password + Google via Lovable OAuth), `src/routes/auth.tsx` |
| Supabase usage | Implemented | Client reads via RLS; all mutations to `pieces`/`agent_runs` via Edge Functions |
| Edge Functions | Implemented | `start-workflow`, `piece-action`, `create-checkout-session`, `stripe-webhook`, `cursor-webhook`, `reconcile-runs` + `_shared/` |
| Stripe integration | Implemented | Checkout sessions (server-only key), signature-verified webhook, `stripe_events` inbox, reconciler heal pass |
| Credit / entitlement logic | Implemented | Append-only `credit_ledger`, `credit_reservations` (reserve → settle/release), balance projection in `credit_accounts`, SECURITY DEFINER money functions revoked from clients |
| Artifact generation | Implemented | Cloud agent runs (Cursor/Parallel) dispatched by Edge Functions; state machine in `supabase/functions/_shared/state.ts` |
| Print / PDF pipeline | Implemented | Client-side paged-media US Letter pipeline: `src/lib/print-document.ts` + `src/styles/print.css` + S{n}P{m} anchors, browser print/Save-as-PDF |
| Mobile behavior | Implemented | Bottom tabs, safe-area padding, `min-h-11` touch targets (two violations found and fixed, see §3) |
| Branding / landing | Implemented | `src/config/brand.ts` is authoritative; landing page at `/`; brand docs in `docs/brand/` |
| Agent rules / skills | Implemented, partially stale | `AGENTS.md` router + `.cursor/skills/` + `.cursor/agents/` reviewers (see §3) |
| Tests | Partially implemented | Vitest (`tests/`), Deno (`supabase/functions/_tests/`), live-DB SQL tests (`supabase/tests/`, not in CI) |
| CI | Implemented | `.github/workflows/ci.yml`: lint, typecheck, vitest, build, guard scripts, Deno tests |
| Deployment configuration | Documented, not reachable | Lovable Cloud / Supabase dashboard; manual steps in `docs/RUNBOOK.md` and `docs/BILLING.md` |
| Subscriptions | Schema only | `subscriptions` table exists; no Stripe subscription flow, no UI — packs only |
| Stripe Customer Portal | Not implemented | No portal route or UI; intentional current scope |

## 2. Reconciliation matrix

| Feature A | Feature B | Status | Notes |
| --- | --- | --- | --- |
| Agent skills | Payments | **Stale → fixed** | `mobile-ui-polish`, `supabase-change`, `mobile-ux-reviewer` had zero billing content; `production-readiness` lacked the Stripe test-mode checklist; no dedicated billing skill despite the router pointing at "`run-orchestration-change` + docs/BILLING.md" |
| Agent skills | Print/PDF | **Partially aligned → fixed** | Geometry, anchors, commands all correct; the credit boundary (what is and is not billable around printing) was stated nowhere in the print skill |
| Agent skills | Mobile UI | **Aligned** | Paths, conventions, and validation steps verified against code |
| Payments | Credit ledger | **Aligned** | Checkout → webhook → idempotent grant; reserve at dispatch, settle/release at terminal transition; refunds and chargebacks are ledger reversals |
| Payments | UI | **Partially aligned** | UI never grants credits client-side (correct); but the "Cost" tab (USD provider spend) and "credits" (billing) coexist without explanation, and dictation errors route users to Lovable workspace billing (different system) — copy clarified, naming decision deferred (§4) |
| Payments | Artifact generation | **Aligned** | Billable boundary is run dispatch; settlement happens on deliverable fetch success; chained research→compose shares the parent reservation |
| Payments | Failure handling | **Aligned** | Release on dispatch 4xx, agent failure, cancel, research timeout; reconciler sweeps stale holds (>1h) and unresolved terminal runs |
| Branding | Product UI | **Partially aligned → fixed** | Landing page hardcoded four brand strings that `docs/brand/NAMING.md` claimed lived only in `brand.ts`; print footer hardcoded the domain |
| Branding | Payment UI | **Aligned** | Billing copy is restrained; paywall is an amber banner + link, consistent with brand tone |
| Print/PDF | Branding | **Aligned → improved** | Footer domain now injected from `brand.ts` instead of hardcoded in `print.css` |
| Print/PDF | Mobile preview | **Partially aligned → fixed** | Preview iframe fine; print-confirm modal buttons violated the repo's own `min-h-11` rule |
| Supabase | Stripe | **Aligned, one gap → fixed** | Secrets, webhook, tables, RLS all consistent — except a legacy `GRANT INSERT ON agent_runs/pieces TO authenticated` from the pre-billing schema let a client insert runs without a credit reservation |
| Supabase | Skills | **Stale → fixed** | `supabase-change` skill predated the billing schema entirely |
| Documentation | Code | **Partially aligned → fixed** | `ARCHITECTURE.md` omitted `/billing` and the frontend billing modules; `UI-COPY-MAP.md` documented a PDF filename no code sets; `cloud-agents-architecture-plan.md` describes a pre-credit design but was cited as current rationale; no root README; no single config inventory |
| Tests | Cross-feature boundaries | **Missing → added** | No test validated skill/doc path references, stripe-webhook rejection/dedup behavior at the handler level, or client-role immutability of the ledger |

## 3. Gap report and corrections

### G1 — Client INSERT on `agent_runs`/`pieces` bypasses credit reservation

- **Affected:** payments ↔ Supabase ↔ artifact generation.
- **Current behavior (before fix):** `20260711040346` granted
  `SELECT, INSERT, UPDATE, DELETE ON workflow_runs TO authenticated` (the
  table later renamed to `agent_runs`); the bug-bash hardening migration
  revoked only UPDATE/DELETE. `pieces` similarly kept INSERT. A client could
  insert run rows directly, skipping `reserve_credits` and the state machine.
- **Expected:** all writes to `pieces`/`agent_runs` go through Edge Functions
  (AGENTS.md rule 7); billable work cannot exist without a reservation.
- **Risk:** free generation records, ledger/job-state divergence, junk rows.
- **Correction:** migration `20260712170000_revoke_client_run_insert.sql`
  revokes INSERT from `authenticated` on both tables; SQL test added.
  No client code performed these inserts (verified: no `.insert()` on either
  table anywhere in `src/`).

### G2 — Skills predate the billing system

- **Affected:** agent skills ↔ payments, mobile UI, Supabase, releases.
- **Correction:** new `.cursor/skills/billing-and-credits/SKILL.md` (thin
  procedural layer over `docs/BILLING.md`); billing sections and
  cross-references added to `mobile-ui-polish`, `print-artifact-fidelity`,
  `supabase-change`, `production-readiness`; `mobile-ux-reviewer` gained
  billing-surface checks; router updated with an explicit multi-skill rule
  and task→skills examples. Detailed billing procedure lives in one place
  (`docs/BILLING.md`), referenced everywhere else.

### G3 — Brand strings hardcoded outside `brand.ts`

- **Affected:** branding ↔ landing page ↔ print pipeline.
- **Correction:** landing hero/positioning/footer strings now read from
  `brand.ts`; the print footer domain is injected by `print-document.ts`
  from `brand.company.domain`; `docs/brand/NAMING.md` claim is true again.

### G4 — Mobile-rule violations in print and profile flows

- **Affected:** mobile UI ↔ print flow.
- **Correction:** `min-h-11` applied to the print-confirm modal buttons and
  the profile dictation Retry button.

### G5 — Two unexplained billing vocabularies in the UI

- **Affected:** payments ↔ UI ↔ Lovable gateway.
- **Current behavior:** generation credits (`credit_accounts`) appear in the
  header chip and `/billing`; the "Cost" tab shows USD provider spend; the
  dictation feature bills Lovable workspace AI credits and its error copy
  pointed users at "Workspace Settings → Plans & credits".
- **Correction:** dictation error copy now distinguishes workspace AI credits
  from Hardcopy generation credits. Renaming the "Cost" tab and whether
  dictation should consume app credits are product decisions — deferred (§4).

### G6 — Documentation drift

- **Correction:** `/billing` route and frontend billing modules added to
  `ARCHITECTURE.md`; billing surface added to `UI-COPY-MAP.md` and the
  unimplemented PDF-filename claim removed; historical-status banner added to
  `cloud-agents-architecture-plan.md`; root `README.md` created;
  `docs/CONFIGURATION.md` created as the single env-var inventory; unused
  `VITE_SUPABASE_PROJECT_ID`/`SUPABASE_PROJECT_ID` removed from
  `.env.example` and CI.

### G7 — No cross-feature tests

- **Correction:** `tests/agent-os.test.ts` validates every path referenced by
  AGENTS.md, skills, and subagent files, and every npm script they name;
  `supabase/functions/_tests/stripe-webhook.test.ts` covers signature
  rejection and duplicate-event dedup decisions;
  `tests/billing-boundaries.test.ts` guards the client/server `CREDIT_COST`
  mirror, the paywall error detector, and the display-only checkout return;
  `supabase/tests/credits.test.sql`
  extended with client-role immutability checks (ledger UPDATE/DELETE and
  `agent_runs` INSERT must fail).

### Broken asset links

- `__root.tsx` linked `/favicon.ico`, which does not exist (only
  `favicon.svg` ships). The stale alternate-icon link was removed.
- The OG image URL (`https://hardcopy.tools/og-image.png`) is external and
  cannot be verified from this repo; noted in CONFIGURATION.md.

## 4. Unresolved product decisions (documented, not decided)

These need a product call; the reconciliation deliberately does not make it.

1. **Billing in the mobile bottom nav.** The nav has four tabs (Dashboard,
   New, Cost, Profile); `/billing` is reachable only through the header
   credit chip. Adding a fifth tab or replacing one is a navigation redesign.
2. **"Cost" vs "credits" naming.** The Cost tab shows USD provider spend
   (internal metering) while the product bills in credits. Renaming the tab
   (e.g. "Usage") would resolve the collision but changes a primary nav label.
3. **Dictation billing domain.** Voice transcription bills Lovable workspace
   AI credits, not app credits. Copy now says so; whether it should consume
   app credits instead is a pricing decision.
4. **Landing-page free-credit disclosure.** Signup grants 3 credits, but the
   landing page never mentions it. Disclosing it is a marketing/positioning
   choice.
5. **`subscriptions` table.** Schema exists with no flow or UI. Keep as
   forward scaffold or drop in a future migration.

## 5. Validation

The full CI gate was run locally before merge: `npm run lint`,
`npm run typecheck`, `npm test`, `npm run build`, `npm run test:functions`,
`scripts/check-secrets.sh`, `scripts/check-migrations.sh`,
`scripts/check-print-contract.sh`. The SQL tests in `supabase/tests/` require
a live database and remain a manual step (documented in `docs/BILLING.md`).
