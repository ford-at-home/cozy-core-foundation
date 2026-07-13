# Runbook — one-time setup and operations

## One-time setup (owner)

1. **Cursor GitHub app** — already connected. Verified 2026-07-11:
   `GET /v0/repositories` lists `ford-at-home/cozy-core-foundation`, and a live
   smoke run (`bc-3bba400a…`) cloned this repo, wrote
   `pieces/smoke-test/proposal.md`, and pushed branch
   `cursor/smoke-test-proposal-d629` in ~80s.
2. **Edge function secrets** (Lovable Cloud → backend secrets; the complete
   variable inventory is [docs/CONFIGURATION.md](CONFIGURATION.md)). Without
   `CURSOR_API_KEY` the app still works but uses the stub provider (runs are
   marked `bc_stub_…` and produce no content):
   - `CURSOR_API_KEY` — your `crsr_…` key (same one that passed the smoke test).
   - `CURSOR_WEBHOOK_SECRET` — any random string ≥ 32 chars. If unset, runs
     are created without a webhook and the reconciler alone completes them
     (slower, still correct).
   - `RECONCILE_TOKEN` — optional shared secret gating `reconcile-runs`.
   - `AGENT_MODEL`, `AGENT_REPO_URL`, `AGENT_REPO_REF` — optional overrides;
     defaults are unset model, this repo, `main`.
   - `GITHUB_TOKEN` — only needed if this repo goes private (read-only
     contents scope; used by fetch-back, never given to agents).
   - `PARALLEL_API_KEY` — enables the "Research it for me" entry point
     (Parallel AI Task API). Without it, topic submissions are rejected with
     a clear 422; paste-research mode is unaffected. The key never reaches
     the browser or any agent VM.
   - `PARALLEL_PROCESSOR` — optional; overrides the research depth
     (`lite-fast`/`base-fast`/`core-fast`/`pro-fast`/`ultra-fast`,
     default `ultra-fast`).
3. **Reconciler schedule** — applied migration
   `20260712093004_78fc7af4-9a44-4873-a443-92835b8ea0d4.sql` schedules
   `reconcile-runs-every-minute` via pg_cron/pg_net (verified live by the
   Lovable agent, 2026-07-13). Confirm with `select * from cron.job;`.
   Manual fallback:
   `curl -X POST https://dlaojinagezrlbwyritd.supabase.co/functions/v1/reconcile-runs`.

## Applying Cursor-authored migrations (verified procedure, WI-0006)

Migration files pushed to `main` do **not** auto-apply, and Edge Function
edits do **not** auto-deploy. For every backend change:

1. Cursor pushes the SQL under `supabase/migrations/<version>_<name>.sql`
   (and/or the function edits) and files a work item to
   `docs/coordination/lovable/inbox/`.
2. The Lovable agent applies the SQL with its `supabase--migration` tool.
   That tool records its own UUID wrapper row in
   `supabase_migrations.schema_migrations`, so the apply call must ALSO
   insert the file's intended `(version, name, statements)` row with
   `ON CONFLICT (version) DO NOTHING` — otherwise the file's version never
   appears in the history. (Consequence: every applied Cursor migration
   produces two history rows — intended version + Lovable wrapper.)
3. The Lovable agent deploys changed Edge Functions with its deploy tool
   (the frontend, including `src/routes/api/`, deploys automatically with
   the app build).
4. The Lovable agent verifies (`SELECT version FROM
   supabase_migrations.schema_migrations WHERE version = '<version>'`,
   plus a behavior probe for functions) and reports to its outbox.

## Not built yet (deferred, by design)

- **GitHub issue thread + labels** (peer comments, `resynth`/`ready` labels
  mirroring the UI buttons) — requires a GitHub App the owner must register;
  the UI buttons already provide the same actions without it.
- **Style questionnaire** — profile is a free-text `style_text` until the
  elicitation questions land.

(Dictation shipped: `profile.tsx` records audio and transcribes via
`/api/transcribe` → the Lovable AI gateway. It bills **workspace AI
credits**, not the app's generation credits.)

## Deep research flow (kind: research)

Topic → `start-workflow` submits a Parallel task and returns 202 → the
reconciler polls it (statuses: queued/running/completed/failed) → on
completion it fetches the report, wraps it with provenance frontmatter
(query, processor, run_id, date), stores it on the run, and CHAINS a
`proposal` run (Cursor) with the report as RESEARCH. The compose agent
commits the report verbatim to `pieces/<slug>/research/research.md` — that
is the versioned copy in GitHub. The chain is exactly-once (idempotency key
`compose:<user>:research:<runId>`). A research run stuck past 45 minutes is
failed with guidance; check https://platform.parallel.ai for the task.

## Operating notes

- A run stuck in `dispatch_unknown` for >30 min is auto-failed with guidance;
  check the Cursor dashboard for an orphan agent before resubmitting.
- Kill switch: unset `CURSOR_API_KEY` (new runs fall back to the stub) or
  pause the pg_cron job. In-flight agents can be stopped from cursor.com/agents.
- `agent_run_events` holds verbatim webhook/poll payloads per run — first stop
  when a run misbehaves.
- Research-packet workflow runs (`packet`, `followup_research`, `final_docx`,
  `final_pptx`) use the same webhook + reconciler lifecycle. A failed or
  cancelled final run also marks its `final_artifacts` row `failed` so the
  project hub can offer a retry. `piece_events` is the student-visible
  activity trail — append-only and display-only, never authoritative.
- `LOVABLE_API_KEY` powers handwriting recognition (`analyze-returned-page`)
  and dictation transcription (`/api/transcribe`). A gateway 402 surfaces as
  the established "out of AI credits" message, not a user error.
- Backend tests: `deno test --allow-env supabase/functions/_tests/`
  (`--allow-env` is required by the research-chain tests).

## Billing and credits

Credits, Stripe setup, the test-mode plan, admin adjustments, and money
failure scenarios live in [docs/BILLING.md](BILLING.md). Required secrets:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_PUBLIC_URL`; optional
`CREDITS_MODE=log` as the incident lever that meters without blocking.
