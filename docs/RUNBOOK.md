# Runbook — one-time setup and operations

## One-time setup (owner)

1. **Cursor GitHub app** — already connected. Verified 2026-07-11:
   `GET /v0/repositories` lists `ford-at-home/cozy-core-foundation`, and a live
   smoke run (`bc-3bba400a…`) cloned this repo, wrote
   `pieces/smoke-test/proposal.md`, and pushed branch
   `cursor/smoke-test-proposal-d629` in ~80s.
2. **Edge function secrets** (Lovable Cloud → backend secrets). Without
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
3. **Reconciler schedule** — migration `20260711150000_reconciler_cron.sql`
   schedules it every 2 min via pg_cron/pg_net. `[Unverified]` on Lovable
   Cloud: confirm with `select * from cron.job;`. Manual fallback:
   `curl -X POST https://dlaojinagezrlbwyritd.supabase.co/functions/v1/reconcile-runs`.

## Not built yet (deferred, by design)

- **GitHub issue thread + labels** (peer comments, `resynth`/`ready` labels
  mirroring the UI buttons) — requires a GitHub App the owner must register;
  the UI buttons already provide the same actions without it.
- **Dictation** (Whisper) — v1 annotation read-back is typed text.
- **Style questionnaire** — profile is a free-text `style_text` until the
  elicitation questions land.

## Operating notes

- A run stuck in `dispatch_unknown` for >30 min is auto-failed with guidance;
  check the Cursor dashboard for an orphan agent before resubmitting.
- Kill switch: unset `CURSOR_API_KEY` (new runs fall back to the stub) or
  pause the pg_cron job. In-flight agents can be stopped from cursor.com/agents.
- `agent_run_events` holds verbatim webhook/poll payloads per run — first stop
  when a run misbehaves.
