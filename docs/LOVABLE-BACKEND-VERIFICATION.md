# Lovable backend verification brief

**Audience:** the Lovable agent (Lovable Cloud backend access).
**Date issued:** 2026-07-13.
**Context:** a production-readiness audit of this repository was completed in a
separate coding environment. The audit's remaining unknowns all live in
Lovable Cloud / Supabase state that only Lovable can inspect. This brief asks
for **verification, configuration checks, and read-only queries only**.

> **Scope guard — important**
>
> Please do **not** modify any repository code as part of this brief: no edits
> to `supabase/functions/`, `supabase/migrations/`, `src/`, or tests. All code
> changes are being handled in a separate, sequenced coding pass; concurrent
> edits would collide on `main`. Everything below is read-only inspection,
> settings verification, or (item 10) creating one test account.

Report results for each numbered item. Where a query returns rows, include
the rows verbatim (redact nothing except secret values — none of these
queries return secret values).

---

## 1. Reconciler cron job

Run both queries and report the output:

```sql
select jobid, jobname, schedule, active from cron.job;
```

```sql
select jobid, status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 20;
```

What we need to learn: the repository contains two candidate schedule
migrations (a 2-minute job and a 1-minute job). Which job(s) actually exist,
are they active, and are recent executions succeeding? If `return_message`
shows HTTP 401s, that confirms item 2 below.

## 2. `RECONCILE_TOKEN` secret

Check whether the backend secret `RECONCILE_TOKEN` is currently set (report
**name and set/unset only — never the value**).

Why it matters: the pg_cron job posts to the `reconcile-runs` function
**without** an Authorization header. If `RECONCILE_TOKEN` is set, the
function rejects every cron invocation and the app's authoritative
run-completion path is silently dead.

## 3. Backend secrets inventory (names only)

Report which of these secret **names** are set vs unset (no values):

`CURSOR_API_KEY`, `CURSOR_WEBHOOK_SECRET`, `PARALLEL_API_KEY`,
`LOVABLE_API_KEY`, `GITHUB_TOKEN`, `AGENT_IMAGE_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `APP_PUBLIC_URL`, `CREDITS_MODE`, `AGENT_MODEL`,
`AGENT_REPO_URL`, `AGENT_REPO_REF`, `PARALLEL_PROCESSOR`, `RECONCILE_TOKEN`,
`OPENAI_API_KEY`.

## 4. Applied migrations

```sql
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 30;
```

Report the list so it can be diffed against the repository's
`supabase/migrations/` directory (27 files as of this brief).

## 5. Auth settings

Report the current Supabase Auth configuration:

- Is **email confirmation** required before a new account can sign in?
- Is **captcha** enabled on signup?

Why it matters: a database trigger grants every new `auth.users` row
3 free credits. Without confirmation/captcha, free-credit farming is
trivially scriptable.

## 6. Historical run durations

```sql
select kind, count(*) as runs,
  round((percentile_cont(0.5) within group (order by duration_ms) / 60000.0)::numeric, 1) as median_min,
  round((percentile_cont(0.75) within group (order by duration_ms) / 60000.0)::numeric, 1) as p75_min,
  round((max(duration_ms) / 60000.0)::numeric, 1) as max_min
from agent_runs
where status = 'completed' and duration_ms is not null
group by kind
order by kind;
```

Why it matters: the UI currently shows hard-coded time estimates
("usually 2–10 minutes") with no recorded basis. This query provides the
first real per-stage duration data, which will drive an evidence-based
progress display.

## 7. Stuck-state sweep

All four queries should return **zero rows** on a healthy system. Report any
rows found:

```sql
select id, status, kind, created_at from agent_runs
where status not in ('completed', 'failed', 'cancelled')
  and created_at < now() - interval '1 hour';
```

```sql
select id, status, created_at from page_images
where status = 'analyzing'
  and created_at < now() - interval '30 minutes';
```

```sql
select id, status, created_at from final_artifacts
where status = 'pending'
  and created_at < now() - interval '1 hour';
```

```sql
select id, status, created_at from credit_reservations
where status = 'held'
  and created_at < now() - interval '2 hours';
```

## 8. Cost-telemetry gap confirmation

```sql
select kind,
  count(*) filter (where session_id is null) as missing_session,
  count(*) as total
from agent_runs
where kind in ('followup_research', 'final_docx', 'final_pptx')
group by kind;
```

Why it matters: the audit found that follow-up-research and final-document
runs are created without a `session_id`, and the cost recorder silently
drops inference rows for runs without one — meaning provider spend for the
two most expensive workflow steps is likely unrecorded. This query confirms
or clears that finding against real data.

## 9. Credit-ledger consistency

Every account balance must equal its ledger sum minus held reservations.
This query returns **only violations** — expected result is zero rows:

```sql
select a.user_id, a.balance,
  coalesce(l.total, 0) as ledger_sum,
  coalesce(r.held, 0) as held
from credit_accounts a
left join (
  select user_id, sum(delta) as total from credit_ledger group by user_id
) l using (user_id)
left join (
  select user_id, sum(amount) as held
  from credit_reservations where status = 'held' group by user_id
) r using (user_id)
where a.balance <> coalesce(l.total, 0) - coalesce(r.held, 0);
```

## 10. Test account

Create **one** test user account (email/password signup) for API-level smoke
testing and row-level-security probes. Report the email address only; the
password will be shared out-of-band. If email confirmation is enabled
(item 5), confirm the account so it can sign in.

---

## Reporting format

Reply with the ten numbered items, each containing either the query output,
the setting value, or "done" plus the requested detail. Flag anything
surprising (failing cron runs, stuck rows, ledger drift) prominently at the
top of the reply.
