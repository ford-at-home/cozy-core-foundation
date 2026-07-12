---
name: supabase-change
description: Make safe Supabase backend changes — schema migrations, RLS policies, Edge Functions, config.toml, storage policies, backend secrets. Use for tasks mentioning database tables, columns, migrations, row level security, policies, edge functions, webhooks infrastructure, or Supabase configuration. Preserves the client/server boundary and documents manual dashboard steps instead of claiming them done.
---

# supabase-change

## Purpose

Change the Supabase backend the way this repository already does it:
timestamped SQL migrations with RLS in the same file, Edge Functions that
re-check ownership even though the service role bypasses RLS, secrets that
exist only in Lovable Cloud, and explicit manual-step documentation for
everything that lives outside the repo.

## Use this skill when

- Adding/altering tables, columns, indexes, triggers, or DB functions.
- Adding or changing RLS or storage policies.
- Creating or modifying an Edge Function in `supabase/functions/`.
- Changing `supabase/config.toml` (function JWT settings) or cron schedules.

## Do not use this skill when

- The change is to run states, dispatch, webhook handling, or cost recording
  logic → `run-orchestration-change` (it layers on top of this skill; use both
  if you're also migrating schema).
- The change is purely client-side data _reading_ via the existing tables.

## Required context

- `docs/ARCHITECTURE.md` → Backend section (tables, RLS posture, functions).
- `supabase/migrations/` — read the most recent migrations touching your
  tables; `20260712121000_bugbash_hardening.sql` shows the current RLS
  posture (client UPDATE revoked on `pieces`/`agent_runs`).
- For Edge Function work: the closest existing function as a template
  (`piece-action` for JWT-authenticated user actions, `cursor-webhook` for
  unauthenticated signed callbacks, `reconcile-runs` for cron sweeps) and the
  `_shared/` modules — reuse them, don't reimplement.
- `supabase/config.toml` — every function must have an explicit
  `verify_jwt` entry with a comment justifying `false`.
- `docs/RUNBOOK.md` — the secrets that exist and the manual-steps format.

## Repository conventions (verified)

| Concern            | Convention                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration files    | `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`, timestamp after the latest existing file. Idempotent guards (`if not exists`, `drop … if exists` before create) — Lovable replays migrations.                          |
| New table          | Same migration: `enable row level security` + policies + grants + indexes. Users get SELECT/INSERT on own rows via `auth.uid() = user_id`; UPDATE only if genuinely user-editable (profiles yes, controller tables no). |
| Service role       | `GRANT ALL … TO service_role` on controller tables; mutations happen in Edge Functions.                                                                                                                                 |
| Realtime           | If the UI needs live updates: `alter publication supabase_realtime add table …` (guarded), as in the existing realtime migrations.                                                                                      |
| Edge Function auth | JWT functions: parse `Authorization: Bearer`, `getUser(token)`, then **explicitly check row ownership** — service role bypasses RLS, so the function is the authorization boundary.                                     |
| Secrets            | `Deno.env.get(...)` only. New secrets must be added to `docs/RUNBOOK.md` and set by the owner in Lovable Cloud — you cannot set them.                                                                                   |
| Pure logic         | Extract to `supabase/functions/_shared/*.ts` and cover with a Deno test in `supabase/functions/_tests/`.                                                                                                                |

## Procedure

1. Read the current schema state for affected tables by scanning existing
   migrations (there is no live DB access from the repo — the migration files
   are the source of truth; note any `[Unverified]` dashboard state).
2. Write the migration: new timestamped file, never edit an
   already-committed migration. Include RLS, grants, and indexes with the DDL.
3. Ask of every policy change: does this weaken access? If a query fails under
   RLS, fix the query or add a _narrow_ policy — never broaden an existing one
   as a shortcut, and never disable RLS.
4. For Edge Function changes: copy the closest existing function's structure
   (CORS headers, auth parsing, error shape). Reuse `_shared/` helpers. Keep
   handler thin; put testable logic in `_shared/`.
5. If the function is new, add its `verify_jwt` entry to
   `supabase/config.toml` with a justification comment.
6. Update generated-types expectations: `src/integrations/supabase/types.ts`
   is generated by Lovable/Supabase tooling. If your migration changes the
   schema the client uses, note that types must be regenerated (manual step);
   do not hand-edit the file.
7. Write/extend Deno tests for new `_shared/` logic.
8. Document every step you cannot perform: applying the migration, deploying
   functions, setting secrets, verifying cron (`select * from cron.job;`).

## Validation

- [ ] `bash scripts/check-migrations.sh` — new tables have RLS + policies; no
      unguarded policy drops.
- [ ] `npm run test:functions` (= `deno test --allow-env supabase/functions/_tests/`).
- [ ] `bash scripts/check-secrets.sh` — no secret values entered the repo.
- [ ] If client code changed too: `npm run lint && npm run typecheck && npm run build`.
- [ ] Re-read the final migration top to bottom simulating a replay: would it
      apply cleanly on a database where earlier migrations already ran? Where a
      partial earlier version might exist (Lovable duplicates happen — see
      `20260711145820_*.sql`)?

For independent review of RLS/authorization changes, use the
`backend-integrity-reviewer` subagent (`.cursor/agents/backend-integrity-reviewer.md`).

## Failure modes

- Weakening or dropping an RLS policy to make a failing query work.
- Creating a table without RLS "because only the service role writes it" —
  RLS on + explicit grants is the posture here, always.
- Forgetting that the service role bypasses RLS inside Edge Functions and
  skipping the explicit ownership check (`piece-action` shows the pattern).
- Editing an existing migration file instead of adding a new one.
- Hand-editing `src/integrations/supabase/types.ts`.
- Setting `verify_jwt = false` without an HMAC/token guard and a comment.
- Claiming "migration applied / function deployed / secret set" — none of
  that is possible from this repository. Report manual steps.
- Restoring client UPDATE on `pieces`/`agent_runs` (revoked deliberately).

## Output contract

- Migration file(s) added, tables/policies affected.
- Edge Functions changed and their auth model.
- Tests added/updated and their results.
- Explicit **Manual actions** list: apply migration, deploy which functions,
  set which secrets, regenerate types, verify what in the dashboard.
- Any RLS decision and its justification.

## References

- `docs/RUNBOOK.md` (secrets checklist, cron verification, kill switch)
- `docs/ARCHITECTURE.md` → Backend, Auth and secrets
- `docs/cloud-agents-architecture-plan.md` (design rationale)
