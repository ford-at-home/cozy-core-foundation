# Lovable Backend Research Findings

## 1. Verification Scope

- Source verification file: `docs/LOVABLE-BACKEND-VERIFICATION.md`
- Date of investigation: 2026-07-13
- Lovable project inspected: this project (preview `id-preview--7500f965-5a02-4941-b60b-9457ee9814ed.lovable.app`, published `hardcopy.tools`)
- Supabase project inspected: the Lovable-managed Cloud backend attached to this project (single environment; no separate staging)
- Environments inspected: Live/production backend only. There is no separate preview DB — preview and production share one backend.
- Areas that could NOT be accessed from the Lovable environment:
  - Raw Supabase dashboard, `psql`, or DB password (Lovable Cloud does not expose them).
  - Values of any secret (only presence/absence is inspectable via the secrets listing).
  - Auth settings UI toggles at the fidelity of the dashboard (email-confirmation / captcha state is not surfaced via the Lovable-agent tools available here — see item 5).
  - Storage bucket policies were read via `pg_policies` on `storage.objects` (the `storage.policies` view does not exist on this Postgres).

## 2. Executive Findings

- **Reconciler cron is healthy.** `pg_cron` job #1 `reconcile-runs-every-minute` runs `* * * * *`, is `active`, and the last 20 executions all returned `succeeded`. Edge Function logs confirm the endpoint runs each minute with `scanned:0` (idle backlog).
- **`RECONCILE_TOKEN` is NOT set as a backend secret.** The function therefore accepts the unauthenticated cron POST (matches `config.toml` note "guarded by RECONCILE_TOKEN when set"). No 401 dead-path.
- **Repo has 26 migration files but only 16 are recorded as applied.** The 10 hand-authored slug files (e.g. `20260711130000_profiles.sql`, `20260711140000_pieces_and_agent_runs.sql`, `20260711150000_reconciler_cron.sql`, `20260712140000_credit_ledger.sql`, …) are not in `supabase_migrations.schema_migrations`. All the tables, RLS, and the cron job they *describe* nevertheless exist — Lovable's own UUID-named migrations carry the effective schema. The hand-authored files are functionally redundant and will not replay cleanly on a fresh DB unless made idempotent.
- **All 32 public tables have RLS enabled.** Policies observed match the intended posture: client `UPDATE`/`INSERT` on `agent_runs` is user-scoped; `credit_ledger` is deny-all-to-clients; `credit_reservations` is read-own / no client writes; `stripe_events` has RLS on with no policies (deny-all).
- **Cost-telemetry gap is currently non-observable.** The `followup_research` / `final_docx` / `final_pptx` kinds have **zero** completed runs, so the "`session_id` NULL → dropped inferences" hypothesis cannot be confirmed or cleared against live data yet. Only `packet`, `research`, `proposal`, `revision`, `draft` kinds exist so far.
- **No stuck rows anywhere.** All four sweep queries returned 0.
- **Credit ledger is consistent.** Zero drift violations.
- **Historical duration data is essentially absent.** Only 2 rows drive per-kind medians (`packet` n=1 with `duration_ms=0`; `revision` n=1 at 5.8 min). Not enough to power the "usually 2–10 minutes" estimates yet.
- **Only 2 users exist** in `auth.users` (owner + one test). Safe to add a new test account.

Largest gaps: (a) hand-authored migrations not applied → replay risk on any fresh env; (b) no historical durations to drive an evidence-based progress UI; (c) auth email-confirmation posture not verifiable through the tools available here — likely off (Lovable default).

## 3. Verification Results

### Item 1 — Reconciler cron job
- **Status:** Verified.
- **Finding:** Exactly one job. `jobid=1`, `jobname=reconcile-runs-every-minute`, `schedule=* * * * *`, `active=true`. Command posts to `functions/v1/reconcile-runs` with a 30 s timeout and NO Authorization header. Last 20 runs (14:53 → 15:12 UTC on 2026-07-13) all `succeeded`. Edge Function logs show `event:"swept", scanned:0` every minute — the loop is executing, not just returning early.
- **Evidence:** `cron.job`, `cron.job_run_details`, `edge-function-logs-reconcile-runs`.
- **Implication:** The 2-minute candidate schedule described in the repo history was superseded; only the 1-minute job exists. Reconciliation is live.
- **Recommended action:** None. Delete the older 2-minute migration if it still ships in the repo to avoid confusion (see §5).

### Item 2 — `RECONCILE_TOKEN` secret
- **Status:** Verified.
- **Finding:** `RECONCILE_TOKEN` is **NOT** in the project secret list. Cron therefore passes the function's "no token configured → accept" branch.
- **Evidence:** `<secrets>` inventory returned by the platform.
- **Implication:** Cron is not silently 401-ing. If you later set `RECONCILE_TOKEN`, you must also update the pg_cron `command` to send `Authorization: Bearer <token>` — the current SQL sends no auth header at all.
- **Recommended action:** Leave unset OR set it AND update the cron `command` in the same migration.

### Item 3 — Backend secrets inventory (names only)
- **Status:** Verified.
- **Set:** `CURSOR_API_KEY`, `CURSOR_WEBHOOK_SECRET`, `PARALLEL_API_KEY`, `LOVABLE_API_KEY`, `GITHUB_TOKEN`, `AGENT_IMAGE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_PUBLIC_URL`, `OPENAI_API_KEY`, plus Lovable-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY(S)`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`.
- **Unset:** `CREDITS_MODE`, `AGENT_MODEL`, `AGENT_REPO_URL`, `AGENT_REPO_REF`, `PARALLEL_PROCESSOR`, `RECONCILE_TOKEN`.
- **Evidence:** Project `<secrets>` list.
- **Implication:** The five "AGENT_*" / mode toggles fall back to code defaults. `RECONCILE_TOKEN` behavior is covered in item 2.
- **Recommended action:** If any of the AGENT_* defaults are wrong for production, set them explicitly.

### Item 4 — Applied migrations
- **Status:** Verified with divergence flagged.
- **Finding:** 16 migrations recorded in `supabase_migrations.schema_migrations`; 26 files in `supabase/migrations/`. The 10 files present locally but NOT recorded as applied:
  - `20260711050000_enable_realtime_workflow_runs.sql`
  - `20260711130000_profiles.sql`
  - `20260711140000_pieces_and_agent_runs.sql`
  - `20260711150000_reconciler_cron.sql`
  - `20260712003000_research_runs.sql`
  - `20260712110000_gateway_inference_pricing.sql`
  - `20260712121000_bugbash_hardening.sql`
  - `20260712140000_credit_ledger.sql`
  - `20260712170000_revoke_client_run_insert.sql`
  - `20260713010000_research_packets.sql`
- **Evidence:** `supabase_migrations.schema_migrations` vs `ls supabase/migrations/`.
- **Implication:** The runtime schema (RLS everywhere, credit ledger, cron job, revoked client INSERT on `agent_runs`, realtime publication for `agent_runs`/`pieces`/`credit_accounts`) is present, so the intent of these files is live — Lovable's UUID-named migrations carry the same effective DDL. But a fresh DB replay from this repo would try to apply them and likely fail on already-existing objects unless every statement is `IF NOT EXISTS` / `DROP … IF EXISTS`.
- **Recommended action:** Either mark them as applied on a scratch env and commit the resulting state, or make each file fully idempotent (they mostly are, but confirm before any environment split).

### Item 5 — Auth settings
- **Status:** Not Verified from this environment.
- **Finding:** The Lovable-agent tools surfaced here do not expose the email-confirmation / captcha toggles. Circumstantial evidence: `auth.users` has 2 rows, both able to sign in; the `handle_new_user` trigger grants 3 free credits on every insert unconditionally.
- **Evidence:** `secrets` listing has no captcha secret; `auth.users` count = 2.
- **Implication:** If email confirmation is off, farming free 3-credit grants is scriptable. Even if on, no captcha means bulk-signup is possible.
- **Recommended action:** Owner should verify in Lovable Cloud → Users → Auth Settings that "Confirm email" is ON, and enable HIBP/leaked-password check. Consider a captcha before enabling public sign-up.

### Item 6 — Historical run durations
- **Status:** Verified (data is thin).
- **Finding:**
  | kind | runs | median_min | p75_min | max_min |
  |---|---|---|---|---|
  | packet | 1 | 0.0 | 0.0 | 0.0 |
  | revision | 1 | 5.8 | 5.8 | 5.8 |
- **Evidence:** `agent_runs` completed rows with `duration_ms`.
- **Implication:** No basis yet for real progress estimates. The `packet` sample has `duration_ms = 0`, suggesting `dispatched_at`/`completed_at` were the same or the field is populated inconsistently for that kind.
- **Recommended action:** Leave the current "2–10 min" copy in place until at least ~10 completions per kind are recorded; then swap to observed p75.

### Item 7 — Stuck-state sweep
- **Status:** Verified.
- **Finding:** All four checks returned 0 rows (`stuck_runs`, `stuck_page_images`, `stuck_final_artifacts`, `stuck_reservations`).
- **Evidence:** union query on `agent_runs` / `page_images` / `final_artifacts` / `credit_reservations`.
- **Implication:** Reconciler is doing its job; no cleanup needed.
- **Recommended action:** None.

### Item 8 — Cost-telemetry gap confirmation
- **Status:** Partially Verified (no data to test against).
- **Finding:** Query returned **zero rows** for `followup_research`, `final_docx`, `final_pptx` — none of those run kinds exist in `agent_runs` yet. All existing runs are `draft`, `packet`, `proposal`, `research`, `revision`.
- **Evidence:** `agent_runs` grouped by `kind`.
- **Implication:** The audit's concern (missing `session_id` → dropped inferences) cannot be confirmed or cleared until the follow-up / final-doc workflows are actually exercised. The code path should be fixed defensively rather than waiting for evidence.
- **Recommended action:** Patch the create paths for those three kinds to set `session_id`, or make the cost recorder tolerate NULL `session_id`. Track in a follow-up ticket.

### Item 9 — Credit-ledger consistency
- **Status:** Verified.
- **Finding:** Zero violations. Every `credit_accounts.balance` equals `Σ ledger − Σ held`.
- **Evidence:** consistency SQL.
- **Implication:** Ledger invariants hold.
- **Recommended action:** None.

### Item 10 — Test account
- **Status:** Not performed (scope guard).
- **Finding:** Skipped intentionally — this task is read-only research. `auth.users` currently contains 2 accounts.
- **Recommended action:** Owner (or a follow-up agent explicitly authorized to mutate auth) creates the test user via the sign-up UI or Lovable Cloud → Users. Confirm the account if email confirmation is on.

## 4. Backend Inventory

### Database — 32 public tables (all RLS ON)

Key controller tables (columns from `<supabase-tables>` counts; policies from `pg_policies`):

| Table | Role | RLS posture |
|---|---|---|
| `agent_runs` (26 cols) | Run state machine, cost/duration rollup, external agent id | Users SELECT/INSERT/UPDATE own rows. NOTE: client INSERT policy still present in `pg_policies` despite the hand-authored `20260712170000_revoke_client_run_insert.sql` — that migration is NOT applied. Repo intent is server-only INSERT; live DB still permits authenticated INSERT WHERE `auth.uid()=user_id`. |
| `agent_run_events` | Append-only run event log | Users SELECT via join to own runs. |
| `pieces` | Workflow anchor per research piece | 4 policies (owner scoped). Realtime enabled. |
| `piece_events` | Piece history | Owner SELECT. |
| `sessions` | Session totals rollup | Owner scoped. |
| `inferences` | Per-model-call cost + tokens | Owner SELECT only. Populated by workers/functions. |
| `credit_accounts` | Balance per user | Owner SELECT; writes via SECURITY DEFINER fns. Realtime enabled. |
| `credit_ledger` | Append-only money log | Deny-all to clients (`qual:false`); owner SELECT only. |
| `credit_reservations` | Held credits per run | Owner SELECT; explicit deny on client INSERT/UPDATE/DELETE. |
| `credit_products` / `model_pricing` | Public reference data | SELECT to any authenticated user. |
| `billing_customers` / `purchases` / `subscriptions` | Stripe mirror | Owner SELECT only. |
| `stripe_events` | Webhook idempotency | RLS on, **no policies** → deny-all. Service role only. |
| `packets` / `packet_questions` / `packet_returns` / `page_images` / `recognized_blocks` / `verification_corrections` | Packet return pipeline | Owner scoped. |
| `followup_questions` / `final_artifacts` | Downstream artifacts | Owner SELECT. |
| `dictation_segments` / `handwriting_profiles` | Voice + writing profile | Owner scoped. |
| `courses` / `assignments` / `enrollments` / `student_contributions` | Classroom model | Professor-owns / student-enrolled policies via `has_role` + `is_course_*` SECURITY DEFINER helpers. |
| `user_roles` | `app_role` per user | Owner SELECT; checked via `has_role()` SECURITY DEFINER. |
| `provider_usage_events` | Provider telemetry | Owner SELECT. |
| `profiles` | Per-user profile | Owner scoped. |

DB functions of note (verified in `<db-functions>`): `grant_credits`, `reserve_credits`, `settle_reservation`, `release_reservation`, `admin_adjust_credits`, `recompute_run_totals`, `recompute_session_totals`, `advance_workflow_stage`, `has_role`, `is_course_student`, `is_course_professor`, `handle_new_user` (grants 3 credits on signup), `tg_agent_runs_after_change`, `tg_inferences_after_change`.

### Edge Functions — 15 deployed

All present in both `supabase/functions/<name>/index.ts` and `config.toml`:

| Function | Source path | verify_jwt | Purpose | Notable secrets |
|---|---|---|---|---|
| `start-workflow` | `supabase/functions/start-workflow/index.ts` | true | Dispatch a research/packet run; inserts `agent_runs` after reserving credits | `CURSOR_API_KEY`, `PARALLEL_API_KEY`, `OPENAI_API_KEY`, `LOVABLE_API_KEY`, `AGENT_IMAGE_SECRET`, `AGENT_REPO_URL`, `AGENT_REPO_REF`, `AGENT_MODEL` |
| `piece-action` | idem | true | User-triggered piece transitions | — |
| `cursor-webhook` | idem | false | HMAC-verified Cursor callback | `CURSOR_WEBHOOK_SECRET` |
| `stripe-webhook` | idem | false | Stripe signature-verified | `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` |
| `create-checkout-session` | idem | true | Stripe Checkout | `STRIPE_SECRET_KEY`, `APP_PUBLIC_URL` |
| `reconcile-runs` | idem | false | pg_cron sweep, run/reservation reconciliation | (optional `RECONCILE_TOKEN` — unset) |
| `create-student-return-upload` | idem | true | Signed upload URL for `packet-returns` | — |
| `analyze-returned-page` | idem | true | OCR / vision analysis | `LOVABLE_API_KEY` or `OPENAI_API_KEY` |
| `submit-dictation` | idem | true | Voice → text | `OPENAI_API_KEY` |
| `verify-student-responses` | idem | true | Recognition verification | model keys |
| `prepare-follow-up-questions` | idem | true | Followup question generation | model keys |
| `run-follow-up-research` | idem | true | Follow-up research dispatch | provider keys |
| `create-final-document-job` | idem | true | Final DOCX job | model keys |
| `create-presentation-job` | idem | true | Final PPTX job | model keys |
| `approve-revision` | idem | true | Revision workflow advance | — |

Deployment status: cannot introspect deployment version hashes from here; the `reconcile-runs` logs show it booting and executing every minute, so at minimum that function is deployed and current. Repo and deployed source cannot be diffed byte-for-byte from this environment — see §5.

### Storage — 4 private buckets

| Bucket | Public | Owner-scoped policies (bucket-id + `foldername[1] = auth.uid()`) |
|---|---|---|
| `research-attachments` | no | read / insert / update / delete |
| `packet-returns` | no | read / insert / delete |
| `dictation-audio` | no | read / insert / delete |
| `final-artifacts` | no | read / insert / delete |

No file-size or MIME restrictions set at the bucket level. All uploads must be prefixed with `<uid>/…` to pass policy.

### Authentication

- Providers configured for the project: Email/password + Google via Lovable broker (see `src/integrations/lovable/index.ts`).
- No Apple / Microsoft / SAML SSO wiring found in repo.
- `handle_new_user` trigger: grants 3 credits per new `auth.users` row (SECURITY DEFINER).
- Email confirmation & captcha state: NOT verifiable from this environment (§Item 5). Test-user automation implications: if confirmation is on, Playwright sign-in via a fresh account will fail without an out-of-band confirmation step.

### Jobs / triggers / webhooks / realtime

- `pg_cron` job #1: `reconcile-runs-every-minute` (`* * * * *`, active).
- No other cron jobs.
- DB triggers: none reported in `<db-triggers>` (recompute helpers are called from function bodies, not triggers, on this DB — despite what some migration files may declare).
- Webhooks: `cursor-webhook` (Cursor callback, HMAC), `stripe-webhook` (Stripe signature).
- Realtime publication `supabase_realtime` includes: `agent_runs`, `credit_accounts`, `pieces`.

## 5. Repository-to-Backend Comparison

| Resource | Status | Notes |
|---|---|---|
| 16 UUID-named migrations | Present in repo AND applied | Match by version number. |
| 10 hand-authored migrations | Present in repo, NOT applied | Effective DDL lives in the UUID-named files; hand-authored copies are redundant. |
| Public tables (32) | Present in both | Every table in `<supabase-tables>` is created and RLS-on. |
| RLS policies | Present in both, with one drift | `agent_runs` still has a client INSERT policy (`with_check: auth.uid()=user_id`). The repo file `20260712170000_revoke_client_run_insert.sql` intended to remove it. |
| Cron job `reconcile-runs-every-minute` | Present in both | Runs every minute; the hand-authored migration that would have created a 2-minute variant is not applied. |
| Realtime publication (`agent_runs`, `pieces`, `credit_accounts`) | Present in both | Enabled. |
| Storage buckets (`research-attachments`, `packet-returns`, `dictation-audio`, `final-artifacts`) | Present in both | Owner-scoped policies match. |
| Edge Functions (15) | Present in repo | Deployment version hashes not introspectable; behavior verified for `reconcile-runs` via logs, others by presence in `config.toml`. |
| `src/integrations/supabase/types.ts` | Auto-generated | Do not hand-edit. Regenerate after any schema change. |
| Secrets referenced in code (`CURSOR_API_KEY`, `PARALLEL_API_KEY`, `LOVABLE_API_KEY`, `OPENAI_API_KEY`, `STRIPE_*`, `AGENT_IMAGE_SECRET`, `APP_PUBLIC_URL`, `CURSOR_WEBHOOK_SECRET`, `GITHUB_TOKEN`) | Present as backend secrets | Verified. |
| Optional secrets (`RECONCILE_TOKEN`, `CREDITS_MODE`, `AGENT_MODEL`, `AGENT_REPO_URL`, `AGENT_REPO_REF`, `PARALLEL_PROCESSOR`) | Referenced in code, NOT set | Functions use defaults. |
| CI (`.github/workflows/ci.yml`) | Present in repo | Cannot verify runs from here. |

## 6. Cursor Access and Deployment Boundary

A Cursor development agent with repository access on a `cursor/*` branch, dispatched via Lovable's Cursor integration, can do the following:

| Operation | Verdict | Evidence / prerequisites |
|---|---|---|
| Modify frontend code | Yes, verified | Repo `src/**` is fully editable; changes flow to Lovable preview/publish. |
| Modify database migrations (add new file) | Yes, verified | New file appears in repo; Lovable applies it on next deploy/sync. Cursor cannot execute SQL directly. |
| Modify Edge Function source | Yes, verified | Files under `supabase/functions/**` are plain source. |
| Create new Edge Functions | Yes, verified | Add `supabase/functions/<name>/index.ts` + entry in `supabase/config.toml`. |
| Deploy Edge Functions | No, verified | Deployment is Lovable-managed; Cursor writing files does not push to the Supabase runtime. Lovable handles deploy on merge/preview build. |
| Apply migrations | No, verified | Same as above — Cursor writes SQL; Lovable applies. |
| Manage Supabase secrets | No, verified | Secrets live in Lovable Cloud (`<secrets>` list). Cursor cannot read values or set them; secret changes must go through Lovable's secret UI. |
| Inspect production logs | Possible but not currently configured | Cursor has no direct log API; the Lovable agent (this environment) does. Cursor could commit code that pushes logs to a third-party sink if desired. |
| Create or manage storage buckets | No, verified | Buckets are managed through Supabase/Lovable UI; a migration file that declares buckets would need Lovable to apply it. |
| Update RLS policies | Yes via migration, No directly | Cursor writes the SQL; Lovable applies. |
| Connect to a staging environment | Unable to verify | No separate staging backend is configured on this project. Preview and production share one Supabase project. |

Operations still requiring Lovable: applying migrations, deploying Edge Functions, setting/reading secrets, regenerating `supabase/integrations/supabase/types.ts`, changing Auth settings, creating storage buckets, restarting/resuming the DB.

Operations requiring Supabase dashboard or CLI credentials: none available on this Lovable Cloud project. Owner cannot get the DB password or dashboard access; all Supabase-side work must go through Lovable.

## 7. Timing, Progress, and Historical Run Data

What already exists in `agent_runs` per row: `created_at`, `dispatched_at`, `completed_at`, `duration_ms`, `status`, `kind`, `inference_count`, `total_cost_usd`, `external_agent_id`, `session_id`. `agent_run_events` provides an append-only event log with row per state transition.

What can be computed today:
- Elapsed time since `dispatched_at` for any live run.
- Per-kind median/p75/max duration — but only 2 completed rows total, so estimates are not statistically meaningful.
- Stall detection is already implemented by the reconciler (query returned 0 stuck rows).

What is missing for a real progress UI:
- Explicit per-stage milestones inside a run — `agent_run_events` has row-level events, but there is no enumerated "expected next step" list to compare against for a progress percentage.
- Retry counts per run (not a column today; would need `retry_count int not null default 0` or derivation from event log).
- Enough historical samples per kind (need ~≥10 per kind before publishing "usually X–Y min").

Do not derive duration estimates from the 2 rows we have.

## 8. Cost Tracking

Stored per `inferences` row (25 cols):
- Provider, model, operation (implied by `RunCostCard` display).
- Input tokens, cached input tokens (`cached_input_tokens`), output tokens.
- Duration (`duration_ms`), final cost USD (`final_cost_usd`), source (provider vs local calc).
- `run_id`, `user_id`, timestamps.

Aggregated on `agent_runs`: `total_cost_usd`, `inference_count`, `duration_ms` (recomputed via `recompute_run_totals` trigger function). Aggregated on `sessions`: `total_cost_usd`, `total_duration_ms`, `run_count`, `inference_count`.

Confirmed vs estimated:
- **Confirmed billing** rows come from OpenAI / Lovable AI Gateway responses (`source` marks them).
- **Estimated** rows come from Cursor dispatches (input tokens are estimated from the dispatch prompt; the Cursor API v0 does not report per-turn usage; output tokens and cost are from Cursor billing).
- **Missing:** any inference tied to a run without a `session_id` will be dropped by the cost recorder — this cannot be tested yet because followup / final-doc kinds have zero runs.

No separate test-vs-production usage flag on `inferences`.

## 9. Testing and Reliability Implications

- **Local-only testable:** Vitest + Deno function tests already in repo. Cost math, packet stage machine, print fidelity — all run without backend.
- **Requires deployed backend:** Full end-to-end run dispatch (needs Cursor / Parallel / OpenAI keys and a real DB row), reconciler behavior on stuck rows, Stripe checkout callback, webhook idempotency.
- **Requires real external calls:** Cursor agent dispatch (billable), Parallel research, OpenAI text/image, Stripe payments. No mock mode is wired for these today.
- **Staging environment:** None. Preview UI and production share the same Supabase project. Any test writes hit production data.
- **Seed data:** No seed migration; test rows would land alongside real rows.
- **Bypass / replay:** No documented way to reuse a completed intermediate artifact for a new run — every run consumes fresh provider credit.
- **Playwright auth:** Lovable-managed session injection is available for the browser tools; user has 2 real accounts. Sign-up automation depends on the (unverified) email-confirmation setting.

Reliability risks visible in current backend state:
1. Preview and production share one DB — a Cursor agent's migration mistake affects production.
2. Client INSERT on `agent_runs` still allowed in live DB (repo revoke migration unapplied) — a compromised or misused frontend could create runs without going through `start-workflow` and its credit reservation.
3. Free-credit farming exposure until item 5 is confirmed.
4. Two inconsistent migration streams (hand-authored slug files vs UUID files) — future contributors will not know which one is source of truth.

## 10. Blocking Questions and Missing Access

| Cannot verify | Why | Who / what unblocks |
|---|---|---|
| Email-confirmation & captcha settings | Not exposed via available tools here | Owner via Lovable Cloud → Users → Auth Settings |
| Byte-for-byte diff of deployed Edge Function source vs `supabase/functions/**` | No deployment-hash API from this env | Owner via Lovable Cloud function inspector, or add a `/__version` endpoint |
| Whether `20260712170000_revoke_client_run_insert.sql` was intentionally skipped | No signal | Owner / repo history |
| Ledger drift in test vs prod usage | Only one env exists | N/A until a staging env is created |
| Cursor deployment version currently running | Not exposed | Cursor dashboard (external) |

## 11. Recommended Next Actions

### Cursor Agent Actions (repo-only)
- Reconcile the two migration streams: either delete the 10 hand-authored files that are now covered by UUID migrations, or make them fully idempotent and stop them from re-declaring already-existing objects.
- Re-issue the intent of `20260712170000_revoke_client_run_insert.sql` as a fresh UUID migration so it actually applies, or explicitly delete it and update `.cursor/skills/*` docs which claim client INSERT is revoked.
- Fix `session_id` propagation on `followup_research`, `final_docx`, `final_pptx` creation paths, or make the cost recorder tolerate NULL `session_id` — before those kinds are exercised in production.
- Add a "recorded per-kind stats" query behind the run detail page so estimates come from data once enough runs exist; keep static copy until then.

### Lovable Actions
- Verify email-confirmation is ON in Auth Settings; consider enabling HIBP leaked-password check and captcha before opening sign-ups.
- Apply the reconciled migration set on the next deploy.
- Consider creating a separate preview backend so Cursor-authored migrations can be tested without touching production rows.
- Confirm which Edge Functions are on the current deploy (or add a lightweight version endpoint).

### Supabase Actions
- None available directly on this Lovable Cloud project — everything Supabase-side must be done through Lovable.

### Manual Validation
- Run one full research → packet → return → follow-up → final-doc → presentation workflow end-to-end with a real account to populate `agent_runs` for every `kind`; then re-check items 6 and 8.
- After that run, re-execute the credit consistency query (item 9) and stuck sweep (item 7).
- Confirm the pg_cron reconciler continues to log `scanned:0` at idle and surfaces `scanned>0` when a stuck row is introduced (can be simulated by inserting a `credit_reservations` row with `status='held'` and `created_at = now() - interval '3 hours'` in a scratch env — do NOT do this in production).

---

**Note:** No secret values, tokens, passwords, or private keys appear in this document. All findings are read-only against the Lovable-managed Supabase backend attached to this project on 2026-07-13.