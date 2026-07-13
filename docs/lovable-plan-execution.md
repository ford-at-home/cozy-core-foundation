# Lovable agent plan — execution report

**Date:** 2026-07-13
**Plan:** `docs/PLAN-LOVABLE-AGENT.md`
**Companion findings:** `docs/lovable-backend-research-findings.md`

> Scope guard honored: no edits to `supabase/functions/`, `supabase/migrations/`,
> `src/`, or `tests/`. Only settings changes + read-only queries.

## Highlights (flag-first)

- ✅ **L1 done.** Email confirmation required (auto-confirm OFF); HIBP
  leaked-password check ON; anonymous sign-ins disabled; signups open.
- ⚠️ **L4a rollup triggers exist** — findings doc previously said "none".
  `agent_runs_after_change`, `inferences_after_change`, and
  `on_auth_user_created` are all present.
- ⚠️ **L4b gateway pricing rows missing.** `model_pricing` only has cursor +
  parallel per-task rows. No `lovable` or `openai` rows → all Lovable AI /
  OpenAI inference records at $0 until Cursor step C4 seeds them.
- ⚠️ **L4c duration recording still patchy.** Only the post-fix `revision`
  row records `duration_ms`; the latest `packet` row records `0`; all older
  `draft` / `proposal` / `research` rows are NULL.
- ⚠️ **L5 baseline confirms the fix is needed.** Client-side INSERT/UPDATE/DELETE
  on `agent_runs` and `pieces` are still granted, and the matching RLS
  policies still exist. Re-verify after C4 ships.
- 🟢 Reconciler cron healthy (1-minute job, recent runs succeeded); no stuck
  rows anywhere; zero credit-ledger drift.
- ⏸️ **L2, L3, L5, L6, L7 pending external action** (owner-provided test-email
  domain, Cursor commits on `main`, certification runs).

---

## L1 — Auth settings ✅

| Setting | Value |
|---|---|
| `auto_confirm_email` | false (email confirmation required) |
| `password_hibp_enabled` | true |
| `external_anonymous_users_enabled` | false |
| `disable_signup` | false |

Captcha is not a first-class toggle in the Lovable Cloud auth surface — owner
decision, left off pending explicit request.

## L2 — Test accounts ⏸️ blocked on owner

Cannot create these without an email domain the owner controls, and email
confirmation is now ON (per L1) so signup mail must reach a real inbox.
Please supply the plus-address or domain to use (e.g.
`test-a+hardcopy@yourdomain`). Then I'll create both via the normal signup
flow, confirm them, and report the addresses here — passwords go out-of-band.

## L3 — Migration pipeline experiment ⏸️ blocked on Cursor C2

Waiting for the no-op marker migration on `main`. Current state of the
applied migrations list (all UUID-named, none of the repo's 10 hand-authored
files present) — 16 rows, matching the prior findings doc.

Most recent applied:

```
20260713114727  20260713114723_882c762b-3a26-4a47-aed2-b9b3ad8364d2
20260713090647  20260713090641_079ba6ff-0b81-4ffb-9366-f1e8bc09d7bd
20260713043042  20260713043040_1528bbcd-4fe5-4bfa-a306-e4415b63990d
20260713033614  20260713033613_ffeff1a7-7106-4466-a750-16771409fa4b
20260712172455  20260712172453_7d0d5a63-a03e-4cf4-9fd6-b96afb2e76d3
20260712165811  20260712165810_4626b17d-4b64-4dbe-86b2-ef3a0b53f3c7
20260712101615  20260712101613_09aa6587-9348-468a-b0bf-bc2a7f44539c
20260712095829  20260712095827_8591bf11-cabd-417f-a5c4-add869f07b1a
20260712095814  20260712095813_d322a5a1-90c5-4cab-a6db-3b55807cc207
20260712093005  20260712093004_78fc7af4-9a44-4873-a443-92835b8ea0d4
20260712091031  20260712091030_3903d6bf-7166-44a2-9c65-8976a141f517
20260711152422  20260711152419_c6bad789-4c50-4139-ac92-5dc9e79e7bc5
20260711150102  20260711150101_31ede3d4-8311-4d19-aa20-b7ab65ec68e8
20260711145823  20260711145820_dc1a79d4-d2e4-40a1-9bfc-835d051bd832
20260711051118  20260711051115_729d2964-827f-4aa0-ae4c-80e7b6a14693
20260711040348  20260711040346_f23aefad-5cfc-4cad-9630-25f79539e511
```

## L4 — Confirming queries ✅

### 4a. Non-internal triggers

| table | trigger |
|---|---|
| `public.agent_runs` | `agent_runs_after_change` |
| `auth.users` | `on_auth_user_created` (3-credit signup grant) |
| `public.inferences` | `inferences_after_change` |

(cron/storage/realtime internal triggers omitted.)

### 4b. `model_pricing`

Columns present: `id, provider, model, pricing_kind, input_price_per_million,
cached_input_price_per_million, output_price_per_million, per_task_price_usd,
effective_from, effective_to, source_url, notes, created_at`.

| provider | model | pricing_kind | per_task_price_usd |
|---|---|---|---|
| cursor | default | per_task | 0.75 |
| parallel | base-fast | per_task | 0.20 |
| parallel | core-fast | per_task | 0.60 |
| parallel | lite-fast | per_task | 0.05 |
| parallel | pro-fast | per_task | 1.50 |
| parallel | ultra-fast | per_task | 3.00 |

No `lovable` or `openai` rows.

### 4c. Completed-run durations

```
id                                    kind      duration_ms
b7f0b1a0-fd92-4ddd-a299-d5245d5e99c0  packet    0
fe57d999-aebf-4fd5-91cc-ade45b4b346a  revision  350387  ✅
83f50cc1-2f1a-4e50-af5a-0060fbfc74e6  draft     NULL
389c99d9-10fa-42cd-82be-51ad15e25afa  draft     NULL
4b2c05c6-a0b2-46fc-9244-07d47c54f032  proposal  NULL
69acd0af-31c3-4e3a-b4f0-c8921b32c3d0  proposal  NULL
2001bf04-24ae-486e-9bdf-0c7a4aeb883c  research  NULL
f2a2d554-c3e1-47e1-ac8b-7703c333178c  research  NULL
```

Rollup percentiles (only 2 non-null rows): `packet` 0.0/0.0/0.0 min;
`revision` 5.8/5.8/5.8 min. Not enough data yet for an evidence-based UI
estimate — recheck after C4/L7.

## L5 — Schema reconciliation baseline ⏸️ pending C4

Grants currently granted (should be **empty** after C4):

```
pieces      authenticated  INSERT
pieces      authenticated  UPDATE
pieces      authenticated  DELETE
agent_runs  authenticated  INSERT
agent_runs  authenticated  UPDATE
agent_runs  authenticated  DELETE
```

Policies currently present (should drop the INSERT/UPDATE variants):

```
agent_runs  Users can insert their own workflow runs   INSERT
agent_runs  Users can update their own workflow runs   UPDATE
agent_runs  Users can view their own workflow runs     SELECT
pieces      Users can insert their own pieces          INSERT
pieces      Users can update their own pieces          UPDATE
pieces      Users can view their own pieces            SELECT
pieces      pieces: professor reads assigned           SELECT
```

## L6 — Edge Function deploys ⏸️ pending C3

## L7 — Certification support ⏸️ pending owner

Will grant 8 credits on account A via `admin_adjust_credits`
(reason `certification-run`) immediately before the runs, then rerun the
duration + stuck-row + inference-cost + ledger queries and append here.

---

## Cron / reconciler (pre-existing, still healthy)

```
jobid  jobname                       schedule    active
1      reconcile-runs-every-minute   * * * * *   true
```

Five most recent runs at time of check: all `succeeded`, `return_message =
"1 row"`. No 2-minute variant exists.

## Stuck-state sweep (item 7 of original brief)

Zero rows across `agent_runs`, `page_images`, `final_artifacts`,
`credit_reservations`.

## Cost-telemetry gap (item 8)

Zero rows for `kind in ('followup_research', 'final_docx', 'final_pptx')` —
these workflows have not executed yet. Gap can neither be confirmed nor
cleared until they do (post-L7).

## Ledger consistency (item 9)

Zero violations.

---

## Blocking items for owner / Cursor

1. Owner: choose the email prefix/domain for L2 test accounts.
2. Cursor: push the C2 marker migration; push the C3 Edge Function edits;
   push the C4 schema reconciliation migration set.
3. Owner: trigger the two certification runs on account A when C4/C3 are in.
