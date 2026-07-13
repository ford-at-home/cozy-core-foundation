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
3. **Reconciler schedule** — migration `20260711150000_reconciler_cron.sql`
   schedules it every 2 min via pg_cron/pg_net. `[Unverified]` on Lovable
   Cloud: confirm with `select * from cron.job;`. Manual fallback:
   `curl -X POST https://dlaojinagezrlbwyritd.supabase.co/functions/v1/reconcile-runs`.

## Research-packet completion rollout (manual steps — not yet applied)

The end-to-end research workflow (return loop, follow-up research, final
artifacts, professor layer) ships in this repository but requires these
external steps before it works in production. None of them can be performed
from this repo:

1. **Apply migrations** (Lovable Cloud applies `supabase/migrations/` on
   sync; verify all four landed):
   - `20260713100000_packet_returns.sql` — `packet-returns` storage bucket +
     return/recognition/verification/handwriting-profile tables.
   - `20260713110000_followup_research.sql` — `followup_questions`,
     `packets.followup_state`, `followup_research` run kind.
   - `20260713120000_final_artifacts.sql` — `final-artifacts` bucket,
     `final_artifacts` table, `document`/`presentation` run kinds.
   - `20260713130000_professor_controls.sql` — roles/courses/enrollments/
     assignments + SECURITY DEFINER helpers + `pieces.assignment_id`.
   Confirm buckets exist: `select id, public from storage.buckets;` should
   list `research-attachments`, `packet-returns`, `final-artifacts` (all
   private).
2. **Deploy the new Edge Functions**: `packet-return`, `packet-action`,
   `final-artifacts` (all `verify_jwt = true` per `supabase/config.toml`).
   Redeploy `start-workflow`, `reconcile-runs`, and shared-module consumers
   so they pick up the new `_shared/` code.
3. **Secrets** — no new ones. The return loop and final artifacts reuse
   `LOVABLE_API_KEY` (gateway recognition/synthesis) and follow-up research
   reuses `PARALLEL_API_KEY`. Without `PARALLEL_API_KEY`, follow-up research
   is rejected with a clear message; the rest of the loop still works.
4. **Grant the first professor role** (no self-serve professor signup by
   design): `insert into user_roles (user_id, role) values ('<uuid>', 'professor');`
5. **Regenerate Supabase types** after migrations apply
   (`src/integrations/supabase/types.ts` is generated; several client libs
   carry local casts until then).

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

Follow-up research (kind: `followup_research`) rides the same rails: one
Parallel pass carrying the original report plus the approved questions, then
an exactly-once chain to a revised packet run (`version = n+1`).

## Operating notes

- A run stuck in `dispatch_unknown` for >30 min is auto-failed with guidance;
  check the Cursor dashboard for an orphan agent before resubmitting.
- Inline runs (`document`/`presentation`) execute synchronously inside
  `final-artifacts`; one still open after 10 min is a crashed invocation —
  the reconciler fails it and releases the credit hold, and the student can
  simply retry.
- Kill switch: unset `CURSOR_API_KEY` (new runs fall back to the stub) or
  pause the pg_cron job. In-flight agents can be stopped from cursor.com/agents.
- `agent_run_events` holds verbatim webhook/poll payloads per run — first stop
  when a run misbehaves.
- Backend tests: `deno test --allow-env supabase/functions/_tests/`
  (`--allow-env` is required by the research-chain tests).

## Billing and credits

Credits, Stripe setup, the test-mode plan, admin adjustments, and money
failure scenarios live in [docs/BILLING.md](BILLING.md). Required secrets:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_PUBLIC_URL`; optional
`CREDITS_MODE=log` as the incident lever that meters without blocking.
