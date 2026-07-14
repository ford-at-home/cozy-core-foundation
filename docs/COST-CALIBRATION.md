# Cost calibration runbook

Hardcopy Draft tracks cost at **application boundaries** (Parallel tasks,
Cursor agent runs, Lovable/OpenAI gateway calls). Cursor's internal agent
loops are not exposed by API v0 — calibrate placeholders from invoices
instead of expecting per-turn token truth.

**Split delivery (reviving PR #4):**

1. **This schema + dispatch step** — `workflow_cost_targets`,
   `agent_runs.cost_proxies`, `research_chars` at dispatch (WI-0010).
2. **Follow-up Cursor UI** — SessionCostBanner, budget badges, RunCostCard
   proxies — only after Lovable applies the migration and regenerates
   `src/integrations/supabase/types.ts`.

## What is tracked

| Layer | Source | Accuracy |
|-------|--------|----------|
| Session total | Sum of `inferences.final_cost_usd` for all runs in the session | Good after calibration |
| Run total | Sum of inferences for one run | Good after calibration |
| Dispatch estimate | `agent_runs.input.prompt_est_tokens` | Exact for Layer 1 only |
| Cost proxies | `agent_runs.cost_proxies` | For regression / budgeting |
| Budget targets | `workflow_cost_targets` vs session total | Planning comparison |

## Monthly calibration (15 minutes)

### 1. Pull vendor invoices

For the billing period, note totals from:

- **Cursor** — Cloud Agents / team usage dashboard
- **Parallel** — https://parallel.ai (research tasks)
- **Lovable** — AI Gateway credits (images, OCR if used)

### 2. Export tracked totals

In Supabase SQL editor (service role) or via the Sessions UI:

```sql
-- Tracked cost by provider for the period
SELECT provider, SUM(final_cost_usd) AS tracked_usd, COUNT(*) AS inference_count
FROM public.inferences
WHERE created_at >= '2026-07-01' AND created_at < '2026-08-01'
GROUP BY provider
ORDER BY tracked_usd DESC;
```

```sql
-- Sessions over budget (full_piece target = $2.00 default)
SELECT s.id, s.title, s.total_cost_usd, t.target_usd
FROM public.sessions s
CROSS JOIN LATERAL (
  SELECT target_usd FROM public.workflow_cost_targets
  WHERE unit = 'full_piece'
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  ORDER BY effective_from DESC LIMIT 1
) t
WHERE s.total_cost_usd > t.target_usd
ORDER BY s.total_cost_usd DESC;
```

### 3. Compute adjustment factors

```
factor(provider) = invoice_usd(provider) / tracked_usd(provider)
```

If Cursor invoice is $45 but tracked Cursor rows sum to $30 (at $0.75/run × 40
runs), update the placeholder:

```sql
INSERT INTO public.model_pricing
  (provider, model, pricing_kind, per_task_price_usd, effective_from, source_url, notes)
VALUES
  (
    'cursor',
    'default',
    'per_task',
    1.12500000,  -- was 0.75; 45/40 = 1.125 measured average
    now(),
    'https://cursor.com/pricing',
    'Calibrated 2026-07 from invoice / run count'
  );
```

Historical inferences keep their pinned `pricing_id`; new runs use the latest
row. To restate old rows, update `model_pricing` effective dates or run a
one-off SQL update on recent inferences (only if you accept rewriting history).

Repeat for Parallel processors and gateway models (`lovable` / `openai`).

### 4. Tune planning targets

Edit `workflow_cost_targets` when your calibrated averages stabilize:

```sql
INSERT INTO public.workflow_cost_targets (unit, target_usd, notes)
VALUES ('full_piece', 2.50, 'Raised after Q3 calibration');
```

Units shipped by default:

| unit | Default | Use |
|------|---------|-----|
| `full_piece` | $2.00 | Session rollup for a complete piece |
| `research_run` | $3.50 | Parallel deep research only |
| `cursor_run` | $0.75 | Single Cursor agent session |
| `proposal_run` | $1.00 | Compose/resynth with typical research |

### 5. Use cost proxies for regression

`agent_runs.cost_proxies` JSON fields:

| Field | Meaning |
|-------|---------|
| `prompt_est_tokens` | Dispatch prompt size (Layer 1) |
| `research_chars` | Research input size |
| `duration_ms` | Wall time dispatch → complete |
| `image_count` | Images generated this run |
| `ocr_count` | PDF OCR calls this run |
| `gateway_cost_usd` | Sum of lovable + openai inference rows |

Export for analysis:

```sql
SELECT
  r.kind,
  r.total_cost_usd,
  r.cost_proxies->>'prompt_est_tokens' AS prompt_toks,
  r.cost_proxies->>'research_chars' AS research_chars,
  r.cost_proxies->>'duration_ms' AS duration_ms,
  r.cost_proxies->>'image_count' AS images
FROM public.agent_runs r
WHERE r.status = 'completed'
ORDER BY r.completed_at DESC
LIMIT 100;
```

Fit a simple model offline (spreadsheet or notebook):

```
estimated_cost ≈ base[kind] + α × prompt_est_tokens + β × duration_ms + γ × image_count
```

Use coefficients to sanity-check new pieces before invoices arrive.

## Interpreting budget badges

(UI in the follow-up Cursor PR; SQL exports work as soon as WI-0010 is applied.)

- **Under budget** — tracked total ≤ target (planning OK)
- **Over budget** — tracked total > target (investigate: large research, extra
  resynths, many images, or placeholder rates too low)
- **Estimated badge** — some rows use `pricing_source = estimated` (missing
  `model_pricing` row); add pricing before trusting totals

## What we still cannot measure (without architecture change)

- Cursor repository ingestion tokens (Layer 2)
- Tool-result amplification (Layer 3)
- Internal 15–40 agent turns (Layer 4)
- Hidden model selection inside Cursor (Layer 5)

Budget **$0.25–$1.00 per Cursor run** in planning until API usage telemetry
exists or you calibrate empirically from invoices.

## Related

- Cost schema migration: `supabase/migrations/20260712095813_*.sql`
- Gateway pricing seeds: `supabase/migrations/20260713180100_gateway_pricing_seed.sql`
- Proxy + targets migration: `supabase/migrations/20260714080000_cost_proxies_and_targets.sql`
- Operations: [RUNBOOK.md](./RUNBOOK.md)
