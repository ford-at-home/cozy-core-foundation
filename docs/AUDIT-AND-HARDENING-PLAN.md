# Application Audit and Hardening Plan

**Scope:** the happy-path workflow that produces the final Word document
(`pieces.workflow = 'research_packet'`), plus the shared backend, testing,
cost-tracking, and operational readiness around it.
**Date:** 2026-07-13.
**Inputs:** full repository inspection (all validation suites executed), CI
history via the GitHub API, and the Lovable-side backend verification in
[lovable-backend-research-findings.md](lovable-backend-research-findings.md)
("the Lovable findings"), cross-checked against repository code wherever
possible.

Every claim is labeled **Verified** (repo evidence or executed command),
**Live-verified** (Lovable findings, consistent with repo), **Contradicted**
(Lovable findings conflict with repo evidence), or **Unresolved**.

---

## 0. Handoff validation (Lovable findings vs repository)

| Lovable claim                                                                                          | Status                                     | Cross-check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron `reconcile-runs-every-minute` active, all recent runs succeed, no auth header                     | **Live-verified**                          | Matches `supabase/migrations/20260712093004_78fc7af4-9a44-4873-a443-92835b8ea0d4.sql` (the applied 1-minute job). The 2-minute variant in `supabase/migrations/20260711150000_reconciler_cron.sql` is unapplied and stale.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RECONCILE_TOKEN` unset → no 401 dead-path                                                             | **Live-verified**                          | Closes audit defect D7 as a _latent_ risk only: if the token is ever set, the cron must be updated in the same change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 26 migration files in repo; 16 (UUID-named) applied; 10 hand-authored slug files unapplied             | **Live-verified**                          | Repo count confirmed: 16 UUID-named + 10 hand-authored. Pairing confirmed in-repo: e.g. `supabase/migrations/20260711140000_pieces_and_agent_runs.sql` (unapplied) and `supabase/migrations/20260711145820_dc1a79d4-d2e4-40a1-9bfc-835d051bd832.sql` (applied) perform the same rename/DDL; same for the credit ledger pair (`20260712140000` / `20260712165810`).                                                                                                                                                                                                                                                                        |
| `agent_runs` live RLS still allows client INSERT and UPDATE (own rows)                                 | **Live-verified — critical drift**         | Repo evidence explains it: the applied `supabase/migrations/20260711040346_f23aefad-5cfc-4cad-9630-25f79539e511.sql` created INSERT/UPDATE policies + `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`; the revokes live only in the **unapplied** `supabase/migrations/20260712121000_bugbash_hardening.sql` (UPDATE/DELETE) and `supabase/migrations/20260712170000_revoke_client_run_insert.sql` (INSERT), with **no applied UUID twin**. `docs/ARCHITECTURE.md`, `AGENTS.md`, and `supabase/tests/credits.test.sql` all assert the closed posture — the live DB contradicts the repo's documented and tested security model. |
| All 32 public tables RLS-on; money tables deny-all; buckets private and owner-prefixed                 | **Live-verified**                          | Matches repo policy files; `stripe_events` deny-all matches `supabase/migrations/20260712172453_7d0d5a63-a03e-4cf4-9fd6-b96afb2e76d3.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| No stuck rows; credit ledger zero drift; only 2 users                                                  | **Live-verified**                          | Consistent with a barely-used production DB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Duration history: n=2 completed runs with `duration_ms` (packet 0.0 min — anomalous; revision 5.8 min) | **Live-verified**                          | Confirms the audit's conclusion: the "usually 2–10 minutes" UI copy has no data basis. The `packet` row's `duration_ms = 0` suggests `dispatched_at`/`completed_at` handling needs a look for that kind.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Zero `followup_research`/`final_docx`/`final_pptx` runs exist                                          | **Live-verified**                          | The `session_id` cost-drop defect is unobservable live but remains repo-verified: `supabase/functions/run-follow-up-research/index.ts`, `create-final-document-job`, `create-presentation-job` never attach a session, and `supabase/functions/_shared/usage.ts` returns `null` without one. Fix defensively before these paths are first exercised.                                                                                                                                                                                                                                                                                      |
| "DB triggers: none reported"                                                                           | **Contradicted (likely tooling artifact)** | The **applied** `supabase/migrations/20260712095813_d322a5a1-90c5-4cab-a6db-3b55807cc207.sql` creates `inferences_after_change` and `agent_runs_after_change`; the applied credit migration creates `on_auth_user_created`. The Lovable findings themselves list the trigger functions as existing, the 3-credit signup grant fired for both users, and rollup totals exist — so triggers almost certainly exist and the introspection tool under-reported. Confirm with one query (see §12).                                                                                                                                             |
| Cursor "output tokens and cost are from Cursor billing"                                                | **Contradicted**                           | Repo evidence: no call site ever passes `providerReportedCostUsd`; Cursor cost is a seeded `fixed_task_price` placeholder ($0.75) and input tokens are dispatch-prompt estimates (`supabase/functions/_shared/usage.ts`, `_shared/dispatch.ts`). No Cursor billing data enters the system.                                                                                                                                                                                                                                                                                                                                                |
| Function/secret table details (e.g. `submit-dictation` uses `OPENAI_API_KEY`)                          | **Contradicted (minor)**                   | `supabase/functions/submit-dictation/index.ts` only persists transcripts; transcription happens in `src/routes/api/transcribe.ts` via `LOVABLE_API_KEY`. Non-material inaccuracies in the findings' secrets column.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| "New migration file appears in repo; Lovable applies it on next deploy/sync"                           | **Unresolved — and load-bearing**          | Directly contradicted by the same document's own item 4: ten hand-authored migrations have been in the repo for days and were never applied. Whether a Cursor-authored migration pushed to `main` gets applied is **unknown** and gates all schema work in this plan. Smallest experiment in §12.                                                                                                                                                                                                                                                                                                                                         |
| Auth email-confirmation / captcha state                                                                | **Unresolved**                             | Not inspectable by either environment. Owner action (§12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Deployed resources absent from the repository:** none found — all 32 live
tables, 15 functions, 4 buckets, the cron job, and the realtime publication
have repo sources (the classroom tables `courses`/`enrollments`/etc. are in
the applied UUID migrations `20260713043040` and `20260713114723`).

**Repository resources not confirmed as deployed / not applied:**

1. The 10 hand-authored migrations (8 have applied UUID twins; the following
   have **no twin and their intent is NOT live**):
   - `supabase/migrations/20260712170000_revoke_client_run_insert.sql` — client INSERT revoke on `agent_runs`/`pieces`. **Not live.**
   - `supabase/migrations/20260712121000_bugbash_hardening.sql` — client UPDATE/DELETE revoke on `agent_runs`, UPDATE revoke on `pieces`, `sessions_piece_id_unique` index. **Not live** (bucket creation portion is covered — the bucket exists).
   - `supabase/migrations/20260712110000_gateway_inference_pricing.sql` — `model_pricing` seed rows for Lovable gateway per-token pricing and image per-task pricing. **Probably not live** (no UUID twin found; means HWR/OCR inferences record as `estimated` with $0 cost). Confirm with one query (§12).
2. Edge Function source: 15 functions deployed and 15 in repo, but
   byte-for-byte parity is not introspectable. Behavior-verified for
   `reconcile-runs` only (log stream).
3. CI is red on `main` (19 Prettier errors, re-verified after the latest
   pull), so the repo's own quality gate is not currently attesting anything.

---

## 1. Executive assessment

**Rating: Ready for controlled testing. Not yet ready for a small demo
cohort.**

The Lovable findings _improved_ several unknowns — the reconciler cron is
healthy, all required secrets are set, there are no stuck rows, and the
credit ledger is internally consistent. They also _worsened_ the picture in
two ways that outrank everything previously on the P0 list:

1. **The live database does not enforce the security model the repo
   documents, tests, and depends on.** Authenticated clients can INSERT and
   UPDATE their own `agent_runs` and `pieces` rows in production. Every
   architecture document, the skills, and the SQL test suite assert this is
   revoked. The credit-reservation-before-dispatch invariant and the run
   state machine are only enforced for clients that politely use the Edge
   Functions.
2. **The migration pipeline is unreliable or misunderstood.** Ten repo
   migrations were never applied; the effective schema lives in
   Lovable-generated UUID migrations. Until one small experiment establishes
   how a repo migration actually reaches the database, no schema change in
   this plan can be scheduled with confidence.

Additional standing blockers from the original audit, unchanged: red CI on
`main`; zero end-to-end execution of the final-DOCX path (live data confirms
those run kinds have literally never run); confirmed stuck-state and retry
defects in `analyze-returned-page` and the follow-up retry path; the
`session_id` cost-drop on the two most expensive steps.

One environment fact now verified that shapes everything below: **preview and
production share a single Supabase project** (published at `hardcopy.tools`).
There is no staging anywhere. Any test write is a production write.

## 2. Verified architecture and access boundary

Frontend (TanStack Start + React 19), Supabase schema, Edge Functions, print
pipeline, credit system: unchanged from `docs/ARCHITECTURE.md` and confirmed
by both audits. New verified facts: 4 private storage buckets
(`research-attachments`, `packet-returns`, `dictation-audio`,
`final-artifacts`) with owner-prefix policies and **no bucket-level size/MIME
limits**; realtime publication covers `agent_runs`, `pieces`,
`credit_accounts`; secrets set/unset inventory is now known (all provider and
Stripe secrets set; `CREDITS_MODE`, `AGENT_*`, `PARALLEL_PROCESSOR`,
`RECONCILE_TOKEN` unset → code defaults active).

### Responsibility and access matrix

| Resource                                                                  | Cursor can inspect                                                                | Cursor can modify source | Cursor can deploy                                                                          | Lovable required                             | Supabase access required                   | Human action required                    | Unable to verify                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| Frontend (`src/`)                                                         | ✔                                                                                 | ✔                        | ✔ (push to `main` → Lovable build)                                                         | —                                            | —                                          | —                                        | —                                                                  |
| Edge Function source (`supabase/functions/`)                              | ✔                                                                                 | ✔                        | **Unresolved** — deploy is Lovable-managed; whether a push triggers redeploy is unverified | ✔ (deploy)                                   | —                                          | —                                        | deploy parity                                                      |
| Migrations (`supabase/migrations/`)                                       | ✔                                                                                 | ✔ (write files)          | ✘ — cannot execute SQL                                                                     | ✔ (apply)                                    | —                                          | —                                        | **whether pushed files get applied at all** (10 precedents say no) |
| Live schema / RLS / data                                                  | ✘ (no DB credentials, no psql on Lovable Cloud at all)                            | ✘                        | ✘                                                                                          | ✔ (queries via View Backend)                 | ✘ (dashboard not exposed by Lovable Cloud) | —                                        | —                                                                  |
| Secrets                                                                   | names via docs only                                                               | ✘                        | ✘                                                                                          | ✔ (set/list)                                 | ✘                                          | owner decides values                     | values (by design)                                                 |
| pg_cron                                                                   | migration files                                                                   | ✔ (write migration)      | ✘                                                                                          | ✔ (apply + inspect)                          | ✘                                          | —                                        | —                                                                  |
| Auth settings (email confirm, captcha)                                    | ✘                                                                                 | ✘                        | ✘                                                                                          | partially (not surfaced to its agent either) | ✘                                          | **✔ owner via Lovable Cloud UI**         | current state                                                      |
| Storage buckets                                                           | migration files                                                                   | ✔ via migration          | ✘                                                                                          | ✔                                            | ✘                                          | —                                        | —                                                                  |
| Production logs (edge functions)                                          | ✘                                                                                 | —                        | —                                                                                          | ✔ (its agent read them)                      | ✘                                          | —                                        | —                                                                  |
| CI (`.github/workflows/ci.yml`)                                           | ✔ (incl. run history via `gh`)                                                    | ✔                        | ✔ (runs on push)                                                                           | —                                            | —                                          | —                                        | —                                                                  |
| Stripe dashboard, Cursor platform, Parallel platform, GitHub content repo | ✘                                                                                 | ✘                        | ✘                                                                                          | ✘                                            | ✘                                          | ✔ owner                                  | —                                                                  |
| Test execution (vitest, Deno, build, guard scripts, Chromium)             | ✔ — all executed successfully in this environment                                 | ✔                        | n/a                                                                                        | —                                            | —                                          | —                                        | —                                                                  |
| Live API calls with a user JWT (smoke/RLS probes)                         | ✔ possible — publishable key + reachable project; needs a test-account credential | —                        | —                                                                                          | —                                            | —                                          | ✔ create test account + share credential | —                                                                  |

**Staging:** does not exist. The Lovable findings recommend a separate
preview backend; until then, every integration test strategy below is
designed around _not_ writing to production, or writing only under a
dedicated test account.

## 3. Repository-to-deployed-state reconciliation

**Confirmed matches:** 16 UUID migrations applied and present; 32 tables;
RLS-on everywhere; deny-all money tables; 4 buckets with owner-prefix
policies; 15/15 Edge Functions present; cron 1-minute job matches the
applied migration; realtime publication matches; all code-referenced
required secrets set.

**Confirmed mismatches (live behavior diverges from repo intent):**

| #   | Mismatch                         | Live state                         | Repo intent                                              | Consequence                                                                                                                                          |
| --- | -------------------------------- | ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Client writes on `agent_runs`    | INSERT + UPDATE allowed (own rows) | Revoked (`20260712170000`, `20260712121000` — unapplied) | Users can create run rows without credit reservations and mutate status/result/cost fields, bypassing the state machine; docs/tests assert otherwise |
| M2  | Client UPDATE on `pieces`        | Allowed (own rows)                 | Revoked (`20260712121000`)                               | Stage/metadata tampering possible; hub stage model reads these rows                                                                                  |
| M3  | `model_pricing` gateway rows     | Probably absent (no applied twin)  | Seeded (`20260712110000`)                                | HWR/OCR/image inferences priced $0 `estimated` → real gateway spend invisible in rollups                                                             |
| M4  | `sessions_piece_id_unique` index | Probably absent                    | Created (`20260712121000`)                               | Session-duplication race unguarded (the dedupe logic that migration also contains never ran)                                                         |
| M5  | CI status                        | Red (Prettier ×19)                 | Green gate expected by `AGENTS.md`                       | No attestation on `main`                                                                                                                             |

**Deployed-but-not-in-repo:** none found.

**Repo-but-not-deployed:** M1–M4 above, plus the stale 2-minute cron
migration (superseded, should be deleted or neutralized), plus unknown Edge
Function deploy parity.

**Remaining unknowns:** §12.

## 4. Primary Word-document workflow

The stage-by-stage map from the original audit stands (route → action → Edge
Function → state → progress → credits, with all timeout constants). The
Lovable findings add live confirmations and one correction:

- **Reconciler cadence is 1 minute** (not the 2 minutes in `docs/RUNBOOK.md`),
  active and healthy — `scanned:0` each idle minute. UI copy on the project
  hub ("checks in every ~60 seconds") is accurate.
- **Stage completion signals are real**: realtime on `agent_runs` and
  `credit_accounts` is enabled in the live publication, so the hub's
  event-driven display works as coded. `packet_returns`/`final_artifacts`
  rely on the 5-second poll only (not in the publication) — matches code.
- **The final-DOCX stage (`kind='final_docx'`) has never executed in
  production.** Same for `followup_research` and `final_pptx`. The most
  business-critical stage of the product is entirely unexercised — the
  strongest single argument for the certification run in §11.
- **Timing:** live data cannot support any duration estimate (n=2, one
  anomalous `duration_ms=0` packet row). All "usually 2–10 minutes" copy is
  unfounded; instrumentation plan in §9.
- **Missing instrumentation identified by the live data:** per-kind
  completion counts are so low that the plan's duration-stats view would
  render nothing for months unless the certification runs (and cohort usage)
  feed it; retry counts are not recorded anywhere; `duration_ms` population
  is inconsistent for at least the `packet` kind.

Cost per happy path (user credits): 4 (topic entry) or 3 (paste entry).
Provider spend: placeholder-priced ($0.75/Cursor run, $0.05–$3.00/Parallel
task, per-token gateway) — and per M3, the gateway portion is probably
recorded as $0 in production today.

## 5. UX findings

All findings from the original audit stand (raw `StatusPill` machine
statuses; `/runs/$runId` as a debug console; missing print→return bridge;
client-only follow-up skip; terminology drift; dead-end load errors; raw
provider error strings). The Lovable findings refine three of them:

| Screen/stage            | Update                                                                                                                                                                                                                                                                                                                              | Severity               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| All waiting states      | Progress is **real** (realtime + poll + live cron), not simulated — the UI honestly reflects backend state. The one dishonest element is the **hard-coded duration copy**, now proven baseless by live data (n=2). Recommendation unchanged: strip or soften the numbers until ≥10 completions per kind exist, keep elapsed timers. | Med                    |
| Leave-and-return safety | Confirmed safe end-to-end: every stage derives from server rows, verified live (no stuck rows, stage model row-driven). Exception remains the client-only "skip follow-up".                                                                                                                                                         | Low (except skip: Med) |
| Retry cost safety       | Confirmed by live design: reservations settle/release correctly (ledger zero-drift). The follow-up retry defect (stale `requestId` → silent no-op) is the opposite failure: retries that _don't_ happen.                                                                                                                            | Med                    |
| Stalled-job detection   | Backend detection exists and works (reconciler sweeps verified live); the UI lacks a "taking longer than usual" state — feasible now (elapsed vs. threshold), percentile-based version blocked on data.                                                                                                                             | Med                    |
| Artifact reuse          | The Lovable findings confirm there is no mechanism to reuse a completed intermediate artifact across runs — each dispatch spends fresh provider credit. Acceptable for users; the _testing_ strategy must not rely on regeneration (§7).                                                                                            | — (testing concern)    |

**UX recommendations not feasible under the current backend design:** a true
per-run progress percentage (no enumerated milestone list inside a cloud-agent
run — `agent_run_events` records transitions, not plan steps); duration
predictions (no data); cross-run artifact reuse in-product (no dedup layer).
None of these were recommended; they remain explicitly out of scope in favor
of event-driven stage milestones.

## 6. Reliability findings

Unchanged from the original audit except as noted:

- **Resolved / downgraded:** D7 cron-token dead-path (token unset; latent
  only). Stuck-row fears (live sweep clean). Ledger drift (live zero).
  pg_cron uncertainty (healthy, 1-minute).
- **Upgraded to P0:** M1/M2 client-write drift on `agent_runs`/`pieces` —
  this is now a _confirmed production posture_, not a suspected risk. It
  undermines: credit-reservation-before-run, state-machine monotonicity,
  cost rollup integrity (`total_cost_usd` is a client-updatable column on a
  client-updatable table), and the accuracy of every document and test that
  says otherwise.
- **New:** single shared preview/production environment (any experiment is a
  production experiment); migration-pipeline ambiguity (10 unapplied files);
  probable missing gateway pricing rows (M3); missing session-unique index
  (M4).
- **Still open, repo-verified:** stuck `analyzing` page images on gateway
  failure; follow-up retry no-op; missing insert-race fallbacks in the three
  job-creation functions; orphaned `page_images` on abandoned uploads;
  concurrent `start-workflow` piece orphan; no server-side MIME/size
  validation on uploads (now compounded: buckets have no platform limits
  either); signup credit-farming exposure pending the auth-settings answer;
  25-runs-per-tick reconciler ceiling (fine at current scale, now verified
  idle).

## 7. Testing strategy

Revised for the verified boundary (no staging, no local DB credentials, one
production backend, deterministic suites all runnable in this environment):

| Tier                     | What                                                                                                                                                                                                                                                                                                    | Where it runs                                                       | Cost class                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Unit + static guards  | Existing vitest (147) + Deno (88) suites; **add** Edge Function handler tests (fake `Request` + fake admin client, pattern in `supabase/functions/_tests/credits.test.ts`) for the 6 workflow-critical functions                                                                                        | Repo only, every commit                                             | **Free**                                                                                                    |
| 2. Fixture/golden        | Print-fidelity Chromium suite (exists); **add** DOCX structural validator + one checked-in golden `document.docx` (captured from the first certification run); recorded Lovable-gateway HWR responses as fixtures                                                                                       | Repo only, every commit                                             | **Free**                                                                                                    |
| 3. Mocked integration    | Reconciler tick + dispatch flows against fake admin + stubbed fetch (pattern in `supabase/functions/_tests/research.test.ts`); stub provider (`AGENT_PROVIDER=stub`) already exists as the free fake-job runner                                                                                         | Repo only, every commit                                             | **Free**                                                                                                    |
| 4. Live read-only probes | RLS probe suite: two test accounts + publishable key, assert cross-user reads fail on packets/returns/page_images/final_artifacts/storage, **and assert client INSERT/UPDATE on `agent_runs` fails** (this doubles as the M1-fix regression test — today it would _pass at writing_, proving the drift) | Against production, per release                                     | **Cheap** (no provider calls)                                                                               |
| 5. Live workflow smoke   | Test-account run of the free stages only: packet review approve, print build, return upload of 1 fixture photo + `analyze-returned-page` (one gateway call, ~cents), verify                                                                                                                             | Against production, test account, per release                       | **Moderate**                                                                                                |
| 6. Certification         | One paste-entry and one topic-entry full path to DOCX download + structural validation; feeds duration stats; reuses the resulting completed piece as the permanent seeded demo artifact                                                                                                                | Production, test account, per release / after orchestration changes | **Expensive** (~3–7 credits; est. $2–$5 placeholder provider cost per pair — estimates, not billed figures) |

**Local Supabase:** viable in this environment (Docker available in Cursor
VMs is unverified — if `supabase start` works, the 10-file migration replay
problem becomes testable locally and `supabase/tests/credits.test.sql` becomes
runnable; worth one experiment, §12). Do not block the plan on it.

**Playwright:** installed (1.61, Chromium proven working here). Add
`playwright.config.ts` + an `e2e/` suite only after tier-4 accounts exist:
auth via `storageState`, deep links into intermediate stages using the
permanent completed demo piece (no regeneration), screenshots/traces on
failure, tags `@free`/`@live-cheap`/`@expensive` with `@expensive` never in
CI. Sign-up automation depends on the unresolved email-confirmation setting.

**Manual:** 375 px viewport pass, print dialog behavior, camera capture on a
real phone, Stripe test-mode checkout per `docs/BILLING.md`.

## 8. Cost tracking plan

Current capability (both audits agree): per-inference rows with provider,
model, operation, tokens, duration, `pricing_source`, `final_cost_usd`,
idempotency; trigger rollups to `agent_runs`/`sessions`; owner-facing
`/sessions` UI. Attribution today: by user ✔, workflow/piece ✔ (via
session), stage/kind ✔ (`agent_runs.kind`), provider ✔, model ✔, retry ✘,
failed-run ✘ (failures record nothing), test-vs-prod ✘.

Truthfulness classes as they exist **live**: nothing is provider-reported;
Cursor and Parallel are fixed-task placeholders; gateway calls are per-token
calculated **only if** M3's pricing rows exist (else $0 "estimated");
transcription and follow-up refinement are entirely unrecorded; final-doc
and follow-up runs would be dropped by the `session_id` gate.

Minimum viable changes (smallest set that closes the highest-value gaps):

1. Attach sessions in the three job-creation functions (fixes the drop). — code only
2. Record transcription + refinement inferences; seed their pricing rows. — code + M3 migration
3. Re-land the gateway pricing seed so it actually applies. — migration (blocked on the pipeline question)
4. Add `context text default 'production'` to `inferences` and stamp `'test'` for test-account runs. — one migration + a constant
5. Optional, later: `success boolean` + `retry_ordinal int` on `inferences` for failure-cost visibility.

No dashboard work: `/sessions` already renders what matters once the data is
truthful.

## 9. Progress and duration plan

Live data answers the feasibility questions: elapsed time ✔ (timestamps
exist and are populated, one `packet` anomaly aside); stage milestones ✔
(event-driven via existing rows/realtime — already how the hub works);
median/P75 ✘ **until data exists** (n=2 today); stalled detection ✔ backend
(reconciler, verified live) / ✘ user-facing; retry counts ✘ (no field);
completion/failure rates ✔ derivable from `agent_runs` by kind.

Plan (unchanged in design, now grounded in live numbers):

1. Now: keep event-driven stage display; add "taking longer than usual"
   after a fixed threshold (reuse the reconciler's 30/45-minute constants as
   ceilings); soften unfounded duration copy to "usually a few minutes —
   we'll show live status here" until data exists.
2. Instrument: fix `duration_ms` population for the `packet` kind
   (investigate why the live row shows 0); certification runs populate the
   first honest samples for every kind including `final_docx`.
3. At ≥10 completions per kind: a `run_duration_stats` view (median/p75 per
   kind) read by the hub — "usually X–Y minutes, based on recent runs".
   One migration + small frontend read; no cosmetic percentage bar ever.

## 10. Prioritized backlog

Complexity: S (single file / < 1 day of agent work), M (several files +
tests), L (cross-system). "Cursor" = implementable directly from this
environment.

### P0 — before any demo user

| #     | Problem                                                    | Change                                                                                                                                                                                                                                 | Evidence                                                         | Systems               | Deps                                                            | Test                                                            | Cx                 | Access                             |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ | ---------------------------------- |
| P0.1  | CI red on `main`                                           | Prettier-fix `src/routes/_authenticated/project.$pieceId.tsx`, `src/routes/_authenticated/runs.$runId.tsx`                                                                                                                             | `npm run lint` ×19 errors; 6+ failed CI runs                     | frontend              | none                                                            | CI green                                                        | S                  | Cursor                             |
| P0.2  | Migration pipeline unknown                                 | Push one no-op marker migration; Lovable confirms whether it lands in `schema_migrations`; document the real pipeline in `docs/RUNBOOK.md`                                                                                             | 10 unapplied precedents vs findings §6 claim                     | migrations, Lovable   | none                                                            | the experiment is the test                                      | S                  | Cursor + Lovable verify            |
| P0.3  | Live client INSERT/UPDATE on `agent_runs`/`pieces` (M1/M2) | Re-issue the revokes as a fresh migration (idempotent), sequenced after P0.2 proves the pipeline; add tier-4 probe asserting writes fail                                                                                               | Findings §4-M/§5; unapplied `20260712170000`, `20260712121000`   | migrations, live DB   | P0.2                                                            | RLS probe                                                       | S code / M process | Cursor + Lovable apply             |
| P0.4  | Migration stream confusion                                 | Reconcile the 10 hand-authored files: delete the 8 with applied twins (recording their history in the doc), fold the unapplied intents (M1–M4) into new migrations; update `docs/ARCHITECTURE.md` claims that are currently false live | Findings §3-item 4                                               | migrations, docs      | P0.2                                                            | `bash scripts/check-migrations.sh` + Lovable apply confirmation | M                  | Cursor + Lovable                   |
| P0.5  | Page stuck `analyzing` forever                             | Revert status on all early-return/error paths in `supabase/functions/analyze-returned-page/index.ts`; reconciler sweep for stale `analyzing`                                                                                           | repo-verified                                                    | edge fn               | none                                                            | Deno handler test                                               | S                  | Cursor (+ deploy)                  |
| P0.6  | Follow-up retry silent no-op                               | Rotate `requestId` after failure in `src/routes/_authenticated/followup.$packetId.tsx` (mirror Finish card)                                                                                                                            | repo-verified                                                    | frontend              | none                                                            | unit-level                                                      | S                  | Cursor                             |
| P0.7  | Cost rows dropped for final/follow-up runs                 | Attach sessions in the three job-creation functions                                                                                                                                                                                    | repo-verified; live shows kinds never ran — fix before first run | edge fns              | none                                                            | Deno test                                                       | S                  | Cursor (+ deploy)                  |
| P0.8  | Corrupt DOCX can go `ready`                                | Structural validation in `supabase/functions/_shared/followup-final.ts` before upload                                                                                                                                                  | repo-verified                                                    | edge fn               | none                                                            | Deno test w/ fixture                                            | S                  | Cursor (+ deploy)                  |
| P0.9  | Auth farming exposure                                      | Owner verifies email confirmation ON (+ consider captcha) before invites                                                                                                                                                               | findings item 5 unresolved                                       | Lovable Cloud UI      | none                                                            | manual signup check                                             | S                  | **Human**                          |
| P0.10 | Final-DOCX path never executed                             | Certification pair (paste + topic entry) with a test account; capture golden DOCX + first duration samples                                                                                                                             | live: zero `final_docx` runs                                     | production, test acct | P0.3–P0.8 deployed; test account (findings item 10 was skipped) | the run is the test                                             | M                  | Human + Cursor validates artifacts |

### P1 — before the first class/cohort

| #     | Problem                                                            | Change                                                                                                     | Cx  | Access                    |
| ----- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --- | ------------------------- |
| P1.1  | Raw machine statuses user-facing                                   | Human-label map in `src/components/StatusPill.tsx`; de-tech `/runs/$runId`                                 | M   | Cursor                    |
| P1.2  | Print→return bridge missing                                        | Return CTA on `src/routes/_authenticated/print.$runId.tsx` for packet flow                                 | S   | Cursor                    |
| P1.3  | Edge handlers untested                                             | Fake-Request handler tests, 6 critical functions                                                           | M   | Cursor                    |
| P1.4  | Insert-race 500s + piece orphan                                    | Unique-violation re-fetch in 3 job functions; piece cleanup in `start-workflow`                            | S   | Cursor (+ deploy)         |
| P1.5  | Unfounded duration copy                                            | Soften copy now; `run_duration_stats` view + hub read once data exists; fix `packet` `duration_ms` anomaly | M   | Cursor + Lovable apply    |
| P1.6  | Untracked transcription/refinement cost; missing pricing rows (M3) | Record + seed (re-land `20260712110000` intent as a new migration)                                         | S   | Cursor + Lovable apply    |
| P1.7  | No RLS/data-isolation verification                                 | Tier-4 probe suite + two test accounts                                                                     | M   | Cursor + human (accounts) |
| P1.8  | Client-only follow-up skip                                         | Persist skip server-side                                                                                   | S   | Cursor (+ deploy)         |
| P1.9  | Dead-end load errors; raw provider errors                          | Retry button on `src/routes/_authenticated/packet.$runId.tsx`; error-copy pass                             | S   | Cursor                    |
| P1.10 | Test/prod cost mixing                                              | `inferences.context` column + stamping                                                                     | S   | Cursor + Lovable apply    |
| P1.11 | Sessions dedupe index (M4)                                         | Re-land as new migration (dedupe first, then unique index)                                                 | S   | Cursor + Lovable apply    |

### P2 — after initial usage

Playwright `e2e/` harness with seeded demo piece and tags; server-side
MIME/size validation + orphaned `page_images` sweep; daily cost-ceiling
check in dispatch; upload-abandon cleanup; terminology unification
(project/draft, Explore/Research); reconciler backlog visibility; stale
2-minute cron migration deletion (folded into P0.4 if not already);
"taking longer than usual" hub state.

### P3 — longer term

Error tracking (Sentry-class; new dependency — needs approval); separate
preview/staging backend (Lovable recommends it too); admin diagnostics
page; Cursor webhook replay window; provider-reported cost ingestion when
APIs allow; PPTX golden validation; retry-count instrumentation.

## 11. Execution sequence

Small, reversible phases; each ends with the full deterministic suite green
(`npm run lint && npm run typecheck && npm test && npm run build`,
`npm run test:functions`, three guard scripts):

1. **Unbreak CI** (P0.1) — one formatting commit; everything after this is
   attested.
2. **Resolve deployment/environment uncertainty** (P0.2 experiment, P0.9
   owner check, test-account creation) — one marker migration + two
   human/Lovable actions; nothing else is schedulable until the migration
   answer arrives.
3. **Instrumentation + defensive fixes, code-only** (P0.5–P0.8, P1.4,
   P1.6-code, P1.10-code) — Deno-tested, no schema dependencies.
4. **Schema reconciliation** (P0.3, P0.4, P1.6-seed, P1.10-column, P1.11) —
   sequenced after step 2 proves the pipeline; one PR; Lovable applies;
   verify with one View Backend query round.
5. **Deterministic test expansion** (P1.3 handler tests, DOCX validator
   fixtures) — locks in steps 3–4.
6. **Live probes** (P1.7 RLS suite) — proves M1/M2 are actually closed and
   data isolation holds.
7. **Recovery + progress UX** (P1.1, P1.2, P1.8, P1.9, softened copy from
   P1.5) — clear recovery states before polish.
8. **Certification pair** (P0.10) — first real end-to-end proof, golden DOCX
   captured, first duration data recorded.
9. **Duration stats + Playwright happy path** (rest of P1.5, P2 harness) —
   evidence-based timing after evidence exists.
10. **Onboard the demo cohort**, monitoring with the operator checklist
    (`agent_run_events`, stuck-row sweeps, ledger consistency query — all
    now proven runnable via Lovable View Backend).

## 12. Remaining unknowns

| Unknown                                                                 | Smallest resolving action                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does a repo-authored migration pushed to `main` get applied by Lovable? | Push a no-op marker migration; check `supabase_migrations.schema_migrations` via View Backend (P0.2)                                                  |
| Are the recompute/auth triggers actually live (findings said "none")?   | One query: `select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;`                                                                 |
| Are the gateway `model_pricing` rows live (M3)?                         | `select provider, model, pricing_kind from model_pricing;`                                                                                            |
| Email confirmation / captcha state                                      | Owner checks Lovable Cloud → Users → Auth Settings (P0.9)                                                                                             |
| Edge Function deploy parity with repo source                            | Lovable function inspector, or add a version/commit constant to `supabase/functions/_shared/observability.ts` responses and compare after next deploy |
| Does `supabase start` (local stack) work in the Cursor VM?              | One attempt; if yes, the migration-replay problem and `supabase/tests/credits.test.sql` become locally testable                                       |
| Why does the live `packet` run have `duration_ms = 0`?                  | One query on that run's timestamps; then inspect `recompute_run_totals` inputs for that kind                                                          |
| Actual provider spend (invoices) vs placeholder prices                  | Owner checks Cursor/Parallel/Lovable billing pages once; adjust `model_pricing` seeds to match                                                        |

---

_This document supersedes the audit summary delivered in-session on
2026-07-13 and incorporates
[lovable-backend-research-findings.md](lovable-backend-research-findings.md)
as a primary source, cross-checked against the repository. Update this file
when backlog items land or unknowns resolve._
