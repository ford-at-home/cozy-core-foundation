# Unified cost accounting for agent workflows

Introduces a provider-neutral **Session → Run → Inference** model on top of the existing `agent_runs` pipeline, with a versioned pricing table, adapters for Parallel and Cursor, aggregation triggers, and a three-level cost dashboard.

## What "session / run / inference" maps to today

- **Session** = one piece's end-to-end flow (all `agent_runs` sharing the same `piece_id` — research → compose → resynth/ready/revise). A session is created implicitly when the first run of a piece starts. Ad-hoc runs without a piece get their own single-run session.
- **Run** = one existing row in `agent_runs` (Parallel research task, or one Cursor cloud agent).
- **Inference** = billable unit inside a run:
  - Parallel research → **exactly one** `fixed_task_price` inference per run (Parallel bills per processor tier).
  - Cursor compose/ready/revise → **one** inference per run today, `pricing_source = "calculated"` from duration × per-minute rate (or `"estimated"` when rate metadata is missing). Structured so we can add per-model rows later without schema change if Cursor ever exposes usage.

Money is stored as `NUMERIC(18,8)` USD.

## Data model

New tables (all owner-scoped via `sessions.user_id`; RLS + GRANTs per project convention):

- `sessions` — id, user_id, piece_id (nullable), title, status, started_at, completed_at, total_cost_usd, total_duration_ms, run_count, inference_count, metadata jsonb.
- `inferences` — id, session_id, run_id, provider, model, operation_type (`llm|search|extract|crawl|embedding|rerank|tool|other`), external_request_id, started_at, completed_at, duration_ms, input_tokens, cached_input_tokens, output_tokens, input_cost_usd, cached_input_cost_usd, output_cost_usd, provider_reported_cost_usd, calculated_cost_usd, final_cost_usd, pricing_source (`provider_reported|calculated|fixed_task_price|estimated|manual`), pricing_id fk, metadata jsonb, idempotency_key (unique with provider).
- `model_pricing` — id, provider, model (or processor name for Parallel), pricing_kind (`per_token|per_task`), input_price_per_million, cached_input_price_per_million, output_price_per_million, per_task_price_usd, effective_from, effective_to (nullable), source_url. Unique on (provider, model, effective_from).
- `provider_usage_events` — id, provider, session_id, run_id, inference_id, external_id, event_type, payload jsonb, received_at, processed_at, processing_error, unique on (provider, external_id, event_type) for idempotency.

Existing tables:

- `agent_runs` — add `session_id uuid`, `provider text`, `total_cost_usd numeric(18,8) default 0`, `duration_ms integer`, `inference_count integer default 0`, `input_summary text`, `output_summary text`. Backfill `session_id` per piece; standalone runs get a fresh session.

## Aggregation and idempotency

- Trigger on `inferences` insert/update/delete → recompute `agent_runs.total_cost_usd`, `inference_count`, `duration_ms` for the parent run.
- Trigger on `agent_runs` update of cost/duration/status → recompute `sessions.total_cost_usd`, `total_duration_ms`, `run_count`, `inference_count`, and session status (running while any child active; completed when all terminal).
- All writes upsert on `(provider, external_request_id, event_type)` so repeated polling / webhook redelivery never double-charges.
- Parallel writes exactly one inference per run; the run's fixed price is derived from that inference — never stored twice.

## Pricing seed

`model_pricing` seeded with:

- Parallel: one `per_task` row per processor tier (`lite-fast`, `base-fast`, `core-fast`, `pro-fast`, `ultra-fast`) with `source_url` pointing at Parallel's public pricing page. Values are marked as an initial guess; admin edits in-DB take effect on the next inference (past rows keep their historical `pricing_id`).
- Cursor: one `per_task` fallback row per known model (or a single generic row) representing "per-run flat rate" until Cursor exposes token usage. `pricing_source` will be `calculated` when this rate is used with duration, `estimated` when rate metadata is missing.

Admins update pricing by inserting a new row with a later `effective_from`; adapters always pick the row where `effective_from <= now < coalesce(effective_to, ∞)`.

## Provider adapters

New module `supabase/functions/_shared/usage/`:

- `adapter.ts` — `UsageAdapter` interface: `normalizeRun`, `normalizeUsage`, optional `getReportedCost`. Plus a shared `writeInference()` that resolves pricing, computes `final_cost_usd` per precedence rule (`provider_reported → fixed_task_price → calculated → estimated → manual`), inserts the raw payload into `provider_usage_events`, and upserts the inference by idempotency key.
- `parallel.ts` — on research completion (in `_shared/research.ts` at `completeResearchAndChain`), record one `fixed_task_price` inference: provider=`parallel`, operation=`extract`, model=`processor`, external_request_id=Parallel run id, idempotency key `parallel:${run_id}:task`.
- `cursor.ts` — on Cursor run reaching `completed` / `failed` (both in webhook and in reconciler's `awaiting_fetch` path), record one inference: provider=`cursor`, operation=`llm`, model=Cursor model when returned else `"unknown"`, duration=completed_at − dispatched_at, cost=`per_task_price × 1` (or `per_minute × minutes` if that pricing kind is used), pricing_source=`calculated` or `estimated`, idempotency key `cursor:${external_agent_id}:complete`.

Adapters never fabricate token-level rows for providers that don't report them.

## Session lifecycle wiring

- `start-workflow` edge fn: when creating an `agent_runs` row, upsert a session — reuse the piece's existing session, otherwise create one. Set `agent_runs.session_id`.
- `research.completeResearchAndChain`: the chained compose run inherits the same `session_id`.
- `piece-action` (resynth/ready/revise): the new run inherits `session_id` from the source run.
- Session status derived by trigger from children; manual cancel/failure propagates via trigger.

## Server surface (TanStack Start server functions, not Edge Functions)

In `src/lib/costs.functions.ts` (behind `requireSupabaseAuth`):

- `listSessions()` — user's sessions with rollups.
- `getSession(id)` — session + child runs + provider/model/pricing-source breakdown.
- `getRun(id)` — run + child inferences + raw usage metadata.
- `getInference(id)` — single inference detail (already covered by RLS through join).

Cost aggregation math lives in DB triggers; server functions just read.

## UI (three drill-downs)

New pathless section under `_authenticated`:

- `src/routes/_authenticated/sessions.tsx` — table of sessions: title (piece slug or topic), status, total cost with `$X.XX`, duration, run count, provider chips, created. Sortable by cost / newest / duration / runs.
- `src/routes/_authenticated/sessions.$sessionId.tsx` — session detail: big total, "by provider" and "by pricing source" bars, list of child runs with per-run cost and provider chip, cost-over-time sparkline.
- Enhance `src/routes/_authenticated/runs.$runId.tsx` — add a "Cost" card above the existing run detail panel showing run total, per-inference table (provider, model, operation, tokens, calculated vs reported, final, pricing-source badge), and a link back to the parent session.
- Add "Cost" column to the existing dashboard's run list.

Every cost value carries a small badge — **Exact / Calculated / Fixed task price / Estimated / Manual** — matching `pricing_source`. Values are formatted to 4 decimals when < $0.01, 2 decimals otherwise; DB precision stays at 8.

## Implementation order

1. Migration: new tables, GRANTs, RLS, aggregation triggers, session/inference/pricing columns on `agent_runs`; seed `model_pricing` for Parallel + Cursor.
2. Adapter module + `writeInference` helper with idempotency + pricing lookup.
3. Hook `start-workflow`, `_shared/research.ts`, `_shared/complete.ts`, `cursor-webhook`, and `reconcile-runs` to (a) attach/create sessions and (b) call the appropriate adapter at run terminal states.
4. Backfill: one-time migration script inserts a session per existing piece, links historical runs, and writes best-effort inferences (Parallel by processor, Cursor as estimated) so the dashboard isn't empty.
5. Server functions in `src/lib/costs.functions.ts`.
6. Sessions list + detail routes; runs page cost card; dashboard cost column.
7. Deno tests under `supabase/functions/_tests/` for: precedence rule, duplicate-event upsert protection, Parallel processor mapping, Cursor duration-based math, session aggregation on run status transitions.

## Out of scope for this pass

- Rewriting `agent_run_events` — it stays for state-machine transitions; `provider_usage_events` is separate and audit-only for billing.
- Real-time Cursor token accounting (Cursor API doesn't expose it today).
- Admin UI to edit pricing (edit in DB for now; the versioning model already supports safe rotation).
- Multi-currency, invoicing, spend limits, budget alerts.

## Open pricing values you'll want to review

Before I ship, the seeded rates in `model_pricing` are placeholders taken from public pages. After the migration lands you can update any row in-place (or insert a new `effective_from` row) and all *future* inferences will use it. Historical inferences keep their original `pricing_id` and cost, so restated pricing never silently rewrites past totals.
