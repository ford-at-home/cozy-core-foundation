# Execution plan — Cursor agent

**Companion plan:** [PLAN-LOVABLE-AGENT.md](PLAN-LOVABLE-AGENT.md)
(platform settings, accounts, applying/verifying deployments).
**Source audit:** [AUDIT-AND-HARDENING-PLAN.md](AUDIT-AND-HARDENING-PLAN.md)
— read it first; backlog item numbers (P0.x/P1.x) below refer to it.

> **Scope guard**
>
> Repo work only. Do not claim any Lovable/Supabase-side action was
> performed; those belong to the companion plan. Follow `AGENTS.md`
> (skills router, validation commands, final report contract). Every phase
> below ends with the full deterministic suite green before push:
> `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
> `npm run test:functions`, `bash scripts/check-secrets.sh`,
> `bash scripts/check-migrations.sh`, `bash scripts/check-print-contract.sh`.
> Commit each phase separately. `main` syncs to Lovable and deploys — keep
> it working at every commit.

Dependencies on the Lovable plan are marked **[needs Lx]**.

---

## Phase C1 — Unbreak CI (P0.1)

Prettier-fix the two files failing lint on `main`:
`src/routes/_authenticated/project.$pieceId.tsx`,
`src/routes/_authenticated/runs.$runId.tsx` (formatting only — no logic
changes in this commit). Verify CI goes green on push.

## Phase C2 — Migration pipeline marker (P0.2)

Author a no-op marker migration in `supabase/migrations/` (comment header
explaining its purpose + `SELECT 1;`). Push it and notify the owner so the
Lovable agent can run its step L3. **Do not author any real schema change
until L3's answer is back.**

## Phase C3 — Code-only defensive fixes (no schema dependencies)

All Deno-testable; write the tests in the same commits
(fake-admin/fake-Request patterns from `supabase/functions/_tests/credits.test.ts`
and `supabase/functions/_tests/research.test.ts`):

1. **P0.5** — `supabase/functions/analyze-returned-page/index.ts`: every
   early-return and error path after status is set to `analyzing` must
   revert the page to `uploaded` or settle it `failed` (missing
   `LOVABLE_API_KEY`, gateway error, parse failure). Add a stale-`analyzing`
   sweep (>30 min → `failed` with retake guidance) to
   `supabase/functions/reconcile-runs/index.ts`.
2. **P0.6** — `src/routes/_authenticated/followup.$packetId.tsx`: rotate
   `requestId` after a failed dispatch so "try again" creates a new run
   (mirror the Finish card pattern in
   `src/routes/_authenticated/project.$pieceId.tsx`).
3. **P0.7** — attach a session at run creation in
   `supabase/functions/run-follow-up-research/index.ts`,
   `supabase/functions/create-final-document-job/index.ts`,
   `supabase/functions/create-presentation-job/index.ts`, so
   `recordInference` (`supabase/functions/_shared/usage.ts`) stops dropping
   their cost rows. Follow the existing session-ensuring pattern used by
   `supabase/functions/start-workflow/index.ts`.
4. **P0.8** — structural DOCX validation in
   `supabase/functions/_shared/followup-final.ts` before an artifact is
   marked `ready`: ZIP magic bytes, `[Content_Types].xml` present,
   `word/document.xml` present and non-trivial. Invalid → artifact `failed`
   (retryable), never `ready`. Fixture-based Deno test.
5. **P1.4** — unique-violation re-fetch fallback (the
   `start-workflow`/`piece-action` pattern) in the three job-creation
   functions above; orphaned-piece cleanup on the `start-workflow`
   insert race.

After push: notify the owner so the Lovable agent runs step L6 (deploy
verification).

## Phase C4 — Schema reconciliation **[needs L3 answer]**

One PR containing new migrations that:

1. **P0.3** — revoke client INSERT/UPDATE on `public.agent_runs` and client
   UPDATE on `public.pieces`; drop the corresponding policies (idempotent
   `DROP POLICY IF EXISTS` / `REVOKE`). This re-issues the intent of the
   unapplied `supabase/migrations/20260712170000_revoke_client_run_insert.sql`
   and parts of `supabase/migrations/20260712121000_bugbash_hardening.sql`.
2. **P1.6** — re-seed the gateway `model_pricing` rows (intent of the
   unapplied `supabase/migrations/20260712110000_gateway_inference_pricing.sql`),
   idempotent on conflict. Include rows for
   `openai/gpt-4o-mini-transcribe` and `google/gemini-2.5-flash-lite`
   (currently unpriced), and record transcription/refinement inferences in
   `src/routes/api/transcribe.ts` and
   `supabase/functions/prepare-follow-up-questions/index.ts`.
3. **P1.11** — sessions dedupe + `sessions_piece_id_unique` partial unique
   index (intent of the unapplied bugbash migration).
4. **P1.10** — `inferences.context text not null default 'production'`;
   stamp `'test'` when the acting user is a designated test account
   (mechanism: a `test_accounts` table or config — pick the smallest that
   works and document it).
5. **P0.4** — delete the 10 stale hand-authored migration files (8 are
   duplicates of applied UUID migrations; the other 2 are superseded by
   items 1–3 above), and update `docs/ARCHITECTURE.md` + affected
   `.cursor/skills/` text so no document claims live state that item 1 has
   not yet made true. Adjust `scripts/check-migrations.sh` expectations if
   needed.

Sequence with the companion plan: push → Lovable applies and verifies (L5)
→ read its verification output before building anything on top.

## Phase C5 — Deterministic test expansion (P1.3)

Fake-`Request` HTTP handler tests for the six workflow-critical Edge
Functions (`start-workflow`, `create-student-return-upload`,
`analyze-returned-page`, `verify-student-responses`,
`run-follow-up-research`, `create-final-document-job`): auth rejection,
ownership rejection, `requestId` idempotency replay, insert-race fallback,
error status codes. Keep them network-free.

## Phase C6 — Live RLS probe suite (P1.7) **[needs L2 accounts + L5 applied]**

A tagged script/suite (publishable key + the two test accounts) asserting:

- cross-user SELECT fails on `packets`, `packet_returns`, `page_images`,
  `recognized_blocks`, `dictation_segments`, `verification_corrections`,
  `final_artifacts`, and storage objects under another user's prefix;
- client INSERT/UPDATE on `agent_runs`/`pieces` fails (regression test for
  Phase C4 item 1 — before that phase is applied, this assertion FAILS by
  design: it is the proof of the drift);
- own-data reads succeed.

Run manually per release; never in CI (touches production).

## Phase C7 — Recovery and progress UX

Frontend-only, mobile-first (375 px), validated with the standard suite:

1. **P1.1** — human-readable status labels in
   `src/components/StatusPill.tsx`; de-tech `src/routes/_authenticated/runs.$runId.tsx`
   (UUID/`kind`/`branch`/raw error behind a collapsed "technical details"
   disclosure).
2. **P1.2** — "Return your work" CTA on
   `src/routes/_authenticated/print.$runId.tsx` for packet-workflow runs.
3. **P1.8** — persist the follow-up skip server-side (smallest mechanism
   consistent with existing Edge Function patterns).
4. **P1.9** — retry button on `src/routes/_authenticated/packet.$runId.tsx`
   load errors; error-copy pass over `interpretRunError` so raw provider
   bodies never render.
5. **P1.5 (copy half)** — soften every hard-coded duration claim
   ("usually 2–10 minutes", "a minute or two") to non-numeric phrasing with
   the elapsed timer; numbers return only via Phase C8.

## Phase C8 — Duration stats **[needs certification data from L7]**

Migration adding a `run_duration_stats` view (median/p75 per completed
`kind`, minimum n≥10 gate) + hub/new-page copy that reads it ("usually X–Y
minutes, based on recent runs"). Investigate and fix the `packet`
`duration_ms = 0` anomaly (L4 query 4c output tells you where to look —
likely `dispatched_at` handling for chained runs in
`supabase/functions/_shared/research.ts` or the rollup in the applied
migration `supabase/migrations/20260712095813_d322a5a1-90c5-4cab-a6db-3b55807cc207.sql`).

## Phase C9 — Post-certification polish (P2 backlog, as prioritized then)

Playwright `e2e/` harness (auth `storageState`, seeded demo piece,
`@free`/`@live-cheap`/`@expensive` tags); server-side upload MIME/size
validation + orphaned `page_images` sweep; daily cost-ceiling check in
`supabase/functions/_shared/dispatch.ts`; terminology unification;
"taking longer than usual" hub state.

## Standing rules

- One phase per PR/commit series; never batch C3 with C4.
- Every phase's final report follows the `AGENTS.md` contract (skills used,
  validation completed, manual actions, known limitations).
- Anything requiring Lovable/Supabase action goes in "manual actions" —
  never claimed as done.
- No new dependencies without owner approval (Playwright is already
  installed; Sentry-class tooling is P3 and needs sign-off).
