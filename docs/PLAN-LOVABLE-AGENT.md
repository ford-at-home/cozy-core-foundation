# Execution plan — Lovable agent

**Companion plan:** [PLAN-CURSOR-AGENT.md](PLAN-CURSOR-AGENT.md) (repo code work).
**Source audit:** [AUDIT-AND-HARDENING-PLAN.md](AUDIT-AND-HARDENING-PLAN.md).
**Prior findings:** [lovable-backend-research-findings.md](lovable-backend-research-findings.md).

> **Scope guard**
>
> Do **not** edit repository code: no changes under `supabase/functions/`,
> `supabase/migrations/`, `src/`, or `tests/`. All code and migration
> _authoring_ happens in the Cursor plan. Your work is: platform settings,
> account creation, applying/verifying deployments and migrations, and
> read-only queries. Where a step says "apply", it means applying what the
> Cursor agent has already committed — never authoring your own variant of
> the same change (that is how the two-migration-streams problem started).

Work the steps in order. Steps marked **[blocks Cursor]** should be done
promptly because the Cursor plan waits on their results. Report results per
step, in order, quoting query output verbatim.

---

## Step L1 — Auth settings (P0.9) **[blocks demo users]**

1. Verify **email confirmation** is ON for new signups. If OFF, turn it ON.
2. Enable the leaked-password (HIBP) check if available.
3. Report whether captcha is available on this plan; do not enable it yet
   (owner decision).

Why: a database trigger grants every new `auth.users` row 3 free credits.
Without confirmation, free-credit farming is scriptable.

## Step L2 — Create test accounts **[blocks Cursor steps C6, C8]**

Create **two** test accounts via normal email/password signup (they will
each receive the standard 3-credit signup grant — that is expected):

- `test-a+hardcopy@<owner's domain or plus-address>`
- `test-b+hardcopy@<owner's domain or plus-address>`

Requirements:

1. Confirm both accounts (required if L1 turned confirmation on).
2. Report both email addresses. Passwords go to the owner out-of-band —
   never write them in the repo, chat logs that sync to the repo, or this
   document's follow-ups.
3. Do not grant extra credits yet. The certification run (L7) will need
   ~7 credits on one account; grant them at that step via
   `admin_adjust_credits` with reason `certification-run` so the ledger
   stays auditable.

Purpose: account A and B power the row-level-security probes (each must not
see the other's data); account A is also the certification-run account.

## Step L3 — Migration pipeline experiment (P0.2) **[blocks Cursor step C4]**

The Cursor agent will push a no-op marker migration file to `main`
(named like `2026xxxxxxxxxx_pipeline_marker.sql`, containing only a comment
and a harmless `SELECT 1`). When notified it has been pushed:

1. Check whether it appears in `supabase_migrations.schema_migrations`
   (wait through at least one Lovable deploy/sync cycle).
2. If it does **not** auto-apply: determine and document the actual
   procedure by which a repo migration reaches this database (does the
   Lovable agent have to apply it manually? is there a sync action?), and
   apply the marker through that procedure so the pipeline is proven
   end-to-end.
3. Report: the answer, the exact procedure, and the `schema_migrations`
   rows after.

This is the single most important step in this plan: 10 previous repo
migrations were never applied, and until the pipeline is understood, no
schema fix can be scheduled.

## Step L4 — Confirming queries (audit §12) — read-only

Run and report verbatim:

```sql
-- 4a. Do the rollup/auth triggers actually exist? (findings said "none";
--     repo evidence says they were created by applied migrations)
select tgname, tgrelid::regclass as table_name
from pg_trigger where not tgisinternal;
```

```sql
-- 4b. Are the gateway pricing rows live? (suspected missing — would mean
--     handwriting-recognition/OCR spend records as $0)
select provider, model, pricing_kind, input_price_per_million,
       output_price_per_million, task_price, active
from model_pricing order by provider, model;
```

Note: if the column names in 4b don't match, run
`select * from model_pricing limit 5;` and report what exists.

```sql
-- 4c. Why does the completed packet run show duration_ms = 0?
select id, kind, status, created_at, dispatched_at, completed_at, duration_ms
from agent_runs where status = 'completed' order by created_at;
```

## Step L5 — Apply the schema reconciliation (after Cursor step C4 lands)

The Cursor agent will land a migration set on `main` that:

- revokes client INSERT/UPDATE on `agent_runs` and client UPDATE on
  `pieces` (re-issuing the unapplied hand-authored intent),
- seeds the missing `model_pricing` gateway rows,
- adds the `sessions` piece-id unique index (with dedupe first),
- adds an `inferences.context` column (test vs production),
- removes or neutralizes the 10 stale hand-authored migration files.

Your job:

1. Apply the set via the procedure established in L3.
2. Verify after applying:

```sql
-- revokes took effect (expect NO rows granting INSERT/UPDATE to authenticated)
select grantee, privilege_type from information_schema.role_table_grants
where table_name in ('agent_runs', 'pieces')
  and grantee in ('authenticated', 'anon')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

-- policies gone
select polname, polcmd from pg_policy
where polrelid in ('public.agent_runs'::regclass, 'public.pieces'::regclass);

-- pricing rows present
select provider, model from model_pricing where provider in ('lovable', 'openai');
```

3. Report all output.

## Step L6 — Edge Function deploy verification (after Cursor step C3 lands)

The Cursor agent will change several Edge Functions
(`analyze-returned-page`, `run-follow-up-research`,
`create-final-document-job`, `create-presentation-job`, plus shared
modules). After those commits are on `main`:

1. Confirm the functions were redeployed (function inspector / version, or
   log evidence of new boot).
2. If deploys are not automatic on push, document the procedure (same
   spirit as L3) and deploy them.
3. Report how Edge Function deploys actually work for this project — this
   goes in `docs/RUNBOOK.md` via the Cursor agent afterward.

## Step L7 — Certification support (P0.10, last)

When the owner triggers the two certification runs (paste-entry and
topic-entry, on test account A):

1. Beforehand: grant account A 8 credits via `admin_adjust_credits`
   (reason `certification-run`).
2. Afterward, run and report:

```sql
-- durations now recorded for every kind (should include final_docx)
select kind, count(*), min(duration_ms), max(duration_ms)
from agent_runs where status = 'completed' group by kind;

-- no stuck rows (same four sweeps as the original brief)
select id, status, kind, created_at from agent_runs
where status not in ('completed','failed','cancelled')
  and created_at < now() - interval '1 hour';
select id, status, created_at from page_images
where status = 'analyzing' and created_at < now() - interval '30 minutes';
select id, status, created_at from final_artifacts
where status = 'pending' and created_at < now() - interval '1 hour';
select id, status, created_at from credit_reservations
where status = 'held' and created_at < now() - interval '2 hours';

-- cost rows exist for the final/follow-up runs (the session_id fix worked)
select r.kind, count(i.id) as inference_rows, sum(i.final_cost_usd) as usd
from agent_runs r left join inferences i on i.run_id = r.id
where r.kind in ('followup_research', 'final_docx', 'final_pptx')
group by r.kind;

-- ledger still consistent
select a.user_id, a.balance, coalesce(l.total, 0) as ledger_sum,
       coalesce(r.held, 0) as held
from credit_accounts a
left join (select user_id, sum(delta) as total from credit_ledger group by user_id) l using (user_id)
left join (select user_id, sum(amount) as held from credit_reservations
           where status = 'held' group by user_id) r using (user_id)
where a.balance <> coalesce(l.total, 0) - coalesce(r.held, 0);
```

## Out of scope for you (owner-only)

- Checking real provider invoices (Cursor/Parallel/Lovable billing pages)
  against the placeholder prices in `model_pricing`.
- Stripe dashboard work and the Stripe test-mode plan (`docs/BILLING.md`).
- Deciding captcha and pricing.

## Reporting format

One reply per step (or batched, in order), quoting query output verbatim.
Flag anything surprising at the top. Never include secret values or test
account passwords.
