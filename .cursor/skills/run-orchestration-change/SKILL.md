---
name: run-orchestration-change
description: Change the agent-run orchestration and cost-accounting subsystem — dispatch, webhooks, the reconciler, run state machine, idempotency keys, inference/cost recording, model pricing. Use for tasks mentioning agent runs, run statuses, stuck runs, webhook events, dispatch, reconciliation, duplicate events, costs, pricing, or sessions. This is the money-adjacent subsystem: idempotency and monotonic state are non-negotiable.
---

# run-orchestration-change

## Purpose

Modify the run controller — the subsystem this product treats with financial
rigor — without breaking its three core guarantees: **exactly-once effects**
(app-owned idempotency keys), **monotonic state** (late/out-of-order events
can never regress a run), and **append-only accounting** (inference rows
upserted by key; totals only via triggers; the credit ledger is append-only).
The run lifecycle is also the credit lifecycle: dispatch reserves credits,
completion settles them, failure/cancel/sweep releases them
(`_shared/credits.ts`). **Read `docs/BILLING.md` before touching anything
credit- or Stripe-adjacent** — its money rules override convenience.

## Use this skill when

- Changing `supabase/functions/start-workflow`, `cursor-webhook`,
  `reconcile-runs`, `piece-action`, `create-checkout-session`,
  `stripe-webhook`, or anything in `supabase/functions/_shared/` (dispatch,
  state, complete, usage, credits, billing, stripe-reconcile, provider.*,
  parallel, research, prompt, workflow, packet, recognition, followup-final).
- Changing the research-packet workflow functions: `run-follow-up-research`,
  `create-final-document-job`, `create-presentation-job` (billable, key
  shapes `followup:{user}:{requestId}` / `final_docx:{user}:{requestId}` /
  `final_pptx:{user}:{requestId}`), or `analyze-returned-page` (free to the
  student; records gateway inferences under `lovable:hwr:{returnId}:{path}`).
  Their completions persist via `cursor-webhook`/`reconcile-runs`
  (`persistFollowUpResult`, `persistFinalArtifactResult` — binary fetch-back
  into the `final-artifacts` bucket) and settle `final_artifacts` rows on
  failure (`settleFinalArtifactFailure`).
- Adding a run kind, run state, provider, webhook event type, or inference
  source. Current packet-workflow kinds: `packet`, `followup_research`,
  `final_docx`, `final_pptx`.
- Anything about costs or credits: `inferences`, `model_pricing`, `sessions`,
  rollups, `recordInference`, `credit_ledger`, `credit_reservations`,
  reserve/settle/release, Stripe checkout or webhooks.
- Debugging stuck runs, duplicate events, wrong statuses/costs, or stuck
  credit holds.

## Do not use this skill when

- Pure schema/RLS work with no orchestration semantics → `supabase-change`
  (use both when a change spans them).
- Checkout, the Stripe webhook, purchases, refunds, the paywall, or the
  billing UI without run-lifecycle changes → `billing-and-credits` (use both
  when reservation/settlement timing is involved — the credit lifecycle is
  the run lifecycle).
- UI display of runs/costs (`dashboard.tsx`, `runs.$runId.tsx`,
  `sessions*.tsx`, `CostBadge`, `RunCostCard`) → ordinary UI work
  (`mobile-ui-polish` if layout).

## Required context

- `supabase/functions/_shared/state.ts` — the state machine. Read it in full;
  it is small and canonical. Tested by `_tests/state.test.ts`.
- `supabase/functions/_shared/dispatch.ts` — insert-before-dispatch,
  `dispatch_unknown` on ambiguous create (no vendor idempotency on Cursor's
  create API — deliberate).
- `supabase/functions/_shared/complete.ts` — monotonic completion + GitHub
  content fetch-back.
- `supabase/functions/_shared/usage.ts` — `recordInference` (upsert on
  `(provider, idempotency_key)`), `computeCost` precedence, `ensureRunSession`.
- `supabase/functions/cursor-webhook/index.ts` + `_shared/webhook.ts` — HMAC
  verification over the raw body; event dedup via
  `agent_run_events (run_id, external_event_id)`.
- `supabase/functions/reconcile-runs/index.ts` — the authoritative sweep;
  webhooks are an optimization, the reconciler is correctness. It also
  settles/releases credits and sweeps stale reservations.
- `supabase/functions/_shared/workflow.ts` — `advanceStage` (the
  `pieces.workflow_stage` FSM via SECURITY DEFINER `advance_workflow_stage`;
  invalid hops log a warning and continue) and `logPieceEvent` (append-only
  `piece_events` activity trail: display-only, never authoritative, duplicate
  completion events possible under the webhook/reconciler race — the client
  dedupes on `(event, runId)`).
- For credit/Stripe work: `docs/BILLING.md` (money rules, secrets, manual
  Stripe checklist), `supabase/functions/_shared/credits.ts`
  (reserve/settle/release/sweep), `_shared/stripe-reconcile.ts`,
  `supabase/functions/stripe-webhook/index.ts`,
  `supabase/functions/create-checkout-session/index.ts`, and the ledger
  schema in `supabase/migrations/20260712165810_4626b17d-4b64-4dbe-86b2-ef3a0b53f3c7.sql`.
- `docs/cloud-agents-architecture-plan.md` (historical — predates credits)
  and `docs/cursor-api-research.md` for design rationale when changing
  behavior.

## Invariants (do not break)

1. **State transitions only through `canTransition`.** Never write a status
   directly with a raw `.update({ status })` that skips the guard. Unknown
   external statuses map to `null` (hold), never to a terminal state.
2. **Terminal is terminal.** `completed`/`failed`/`cancelled` never transition
   out. "Business-done" means content fetched (`awaiting_fetch → completed`),
   not the provider saying FINISHED.
3. **Every side effect needs an idempotency key.** Run creation:
   `agent_runs.idempotency_key` (unique). Webhook events:
   `(run_id, external_event_id)`. Inferences: `(provider, idempotency_key)`
   with the established key shapes (`cursor:{agent_id}:complete`,
   `lovable:ocr:{runId}:{path}`, `image:{runId}:{promptHash}`,
   `compose:<user>:research:<runId>` for the research→compose chain).
   A retried or redelivered event must be a no-op the second time.
4. **Costs are append-only.** New cost = new `inferences` row (or idempotent
   upsert of the same key). Never UPDATE `agent_runs.total_cost_usd` or
   `sessions.total_*` directly — triggers own those.
5. **Pricing precedence** stays `provider_reported → fixed_task_price →
calculated → estimated → manual`. New billable operations get a
   `model_pricing` row (migration) rather than hardcoded prices.
6. **Webhook trust = HMAC only.** `cursor-webhook` has `verify_jwt = false`;
   signature verification over the raw body is the entire auth model. Never
   process an unverified payload, never log secrets or raw tokens.
7. **The reconciler must remain sufficient on its own** (webhooks can be
   disabled by unsetting `CURSOR_WEBHOOK_SECRET`); don't move
   correctness-critical logic to the webhook-only path.
8. **Credit money rules (`docs/BILLING.md`) are non-negotiable.** The ledger
   is append-only; balances mutate only through the SECURITY DEFINER
   functions (`grant_credits`, `reserve_credits`, `settle_reservation`,
   `release_reservation`); credits are granted only by the verified Stripe
   webhook or the Stripe reconciler, never from a redirect; the client never
   supplies prices; every grant/consumption carries an idempotency key.
   Failed/cancelled/stuck runs must release their holds.

## Procedure

1. Read `state.ts` and the specific module(s) you're changing, plus their
   tests in `supabase/functions/_tests/`.
2. For a new state or transition: update `TRANSITIONS` and `state.test.ts`
   together; trace every caller of `canTransition`/`mapExternalStatus` for
   the new case; check the UI `StatusPill` handles the new status string.
3. For a new event/effect: decide its idempotency key first, following the
   existing shapes. Write down what happens on redelivery, out-of-order
   arrival, and concurrent duplicate — then implement to match.
4. For cost changes: route through `recordInference`; add pricing via a
   migration to `model_pricing` (follow
   `20260713180100_gateway_pricing_seed.sql`); mark estimates as
   `estimated`, never fake `provider_reported`.
5. Keep pure logic in `_shared/` and test it there; handlers stay thin.
6. For credit changes: trace the reservation lifecycle end to end — where the
   hold is placed, settled, released, and swept — and confirm a run failure at
   each stage cannot strand or double-consume a hold. Follow the SECURITY
   DEFINER function boundary; never write `credit_ledger` or
   `credit_accounts` rows directly.
7. If schema changes are needed, apply `supabase-change` for the migration
   conventions.
8. Write or extend Deno tests covering: the happy path, a duplicate delivery,
   and an out-of-order event for the code you touched
   (`_tests/credits.test.ts` shows the credit-side patterns).

## Validation

- [ ] `npm run test:functions` — all Deno tests pass, including new
      duplicate/out-of-order cases you added.
- [ ] `bash scripts/check-migrations.sh` and `bash scripts/check-secrets.sh`
      if migrations/secrets were touched.
- [ ] Grep check: no new raw `status` writes bypassing the transition guard
      (`rg "update.*status" supabase/functions` and inspect).
- [ ] State every idempotency key you introduced and its uniqueness scope in
      the report.
- [ ] If ledger/reservation SQL changed: the SQL invariant suites
      `supabase/tests/credits.test.sql` and
      `supabase/tests/credit-concurrency.sh` need a live database — run them
      if you have one, otherwise list them as a required manual action.
- [ ] If client display changed: `npm run lint && npm run typecheck && npm run build`.

For independent review, use the `backend-integrity-reviewer` subagent
(`.cursor/agents/backend-integrity-reviewer.md`) — orchestration changes
should not be self-certified.

## Failure modes

- Trusting a provider "FINISHED" as completion instead of fetching content
  first (`awaiting_fetch` exists precisely for this).
- Handling a webhook event without dedup, so redelivery double-records an
  inference or replays a transition.
- Mapping an unknown external status to `failed` "to be safe" — forward-compat
  rule says hold (`null`).
- Directly mutating rollup totals or editing an existing `inferences` row's
  cost instead of appending/upserting by key.
- Adding a provider call without a `model_pricing` row, silently producing
  `estimated: $0` costs.
- Weakening HMAC verification (e.g. parsing JSON before verifying the raw
  body) or logging the signature/secret.
- Making the webhook path load-bearing so runs never complete when webhooks
  are off.
- Forgetting `ensureRunSession` for a new run kind, so `recordInference`
  silently returns null (no session, no cost row).
- Granting credits from the `/billing?status=success` redirect or any other
  client-observable signal instead of the verified Stripe webhook.
- Mutating `credit_ledger` / `credit_accounts` directly instead of calling
  the SECURITY DEFINER functions.
- Adding a billable run path that reserves credits but has no release path
  for failure/cancel/stuck — holds strand and users lose credits.
- Trusting a client-supplied price or amount anywhere in checkout.

## Output contract

- Modules changed; state-machine changes listed transition by transition.
- Idempotency keys introduced/affected and their redelivery behavior.
- Credit-lifecycle impact: where holds are placed/settled/released, and what
  happens on failure at each stage.
- Tests added (name the duplicate/out-of-order cases) and results.
- Cost/pricing impact, including new `model_pricing` rows.
- Manual actions (deploy functions, apply migrations, secrets, Stripe
  dashboard steps per `docs/BILLING.md`).

## References

- `docs/BILLING.md` (money rules — read before any credit/Stripe change)
- `.cursor/skills/billing-and-credits/SKILL.md` — required alongside this
  skill for checkout/webhook/paywall work
- `docs/ARCHITECTURE.md` → Run state machine, Cost accounting, Credits and Stripe billing
- `docs/cloud-agents-architecture-plan.md` (historical), `docs/cursor-api-research.md`
- `docs/RUNBOOK.md` → Operating notes (dispatch_unknown, kill switch, `agent_run_events` debugging)
