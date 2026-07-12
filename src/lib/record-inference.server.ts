// Server-side inference recording for Nitro/TanStack routes (image gen, etc.).
// Mirrors supabase/functions/_shared/usage.ts against the same tables.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { estimateTokens } from "@/lib/token-estimate";

type PricingSource =
  | "provider_reported"
  | "calculated"
  | "fixed_task_price"
  | "estimated"
  | "manual";

export type ServerRecordInferenceInput = {
  runId: string;
  provider: string;
  model?: string | null;
  operationType: "llm" | "search" | "extract" | "crawl" | "embedding" | "rerank" | "tool" | "other";
  idempotencyKey: string;
  externalRequestId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  providerReportedCostUsd?: number | null;
  metadata?: Record<string, unknown>;
  rawPayload?: unknown;
};

interface PricingRow {
  id: string;
  pricing_kind: "per_token" | "per_task";
  per_task_price_usd: string | null;
  input_price_per_million: string | null;
  cached_input_price_per_million: string | null;
  output_price_per_million: string | null;
  effective_to?: string | null;
}

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function lookupPricing(
  admin: SupabaseClient,
  provider: string,
  model: string,
): Promise<PricingRow | null> {
  const { data } = await admin
    .from("model_pricing")
    .select(
      "id, pricing_kind, per_task_price_usd, input_price_per_million, cached_input_price_per_million, output_price_per_million, effective_from, effective_to",
    )
    .eq("provider", provider)
    .eq("model", model)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1);
  const row = Array.isArray(data) && data.length > 0 ? (data[0] as PricingRow) : null;
  if (!row) return null;
  if (row.effective_to && new Date(row.effective_to).getTime() < Date.now()) return null;
  return row;
}

function computeCost(
  pricing: PricingRow | null,
  input: Pick<
    ServerRecordInferenceInput,
    "providerReportedCostUsd" | "inputTokens" | "cachedInputTokens" | "outputTokens"
  >,
): {
  finalCost: number;
  source: PricingSource;
  calculatedCost: number | null;
  inputCost: number | null;
  cachedInputCost: number | null;
  outputCost: number | null;
} {
  const reported = toNum(input.providerReportedCostUsd ?? null);
  if (reported !== null) {
    return {
      finalCost: reported,
      source: "provider_reported",
      calculatedCost: null,
      inputCost: null,
      cachedInputCost: null,
      outputCost: null,
    };
  }
  if (!pricing) {
    return {
      finalCost: 0,
      source: "estimated",
      calculatedCost: null,
      inputCost: null,
      cachedInputCost: null,
      outputCost: null,
    };
  }
  if (pricing.pricing_kind === "per_task") {
    const price = toNum(pricing.per_task_price_usd) ?? 0;
    return {
      finalCost: price,
      source: "fixed_task_price",
      calculatedCost: price,
      inputCost: null,
      cachedInputCost: null,
      outputCost: null,
    };
  }
  const inRate = toNum(pricing.input_price_per_million) ?? 0;
  const cacheRate = toNum(pricing.cached_input_price_per_million) ?? 0;
  const outRate = toNum(pricing.output_price_per_million) ?? 0;
  const inToks = input.inputTokens ?? 0;
  const cacheToks = input.cachedInputTokens ?? 0;
  const outToks = input.outputTokens ?? 0;
  const inputCost = (inToks / 1_000_000) * inRate;
  const cachedInputCost = (cacheToks / 1_000_000) * cacheRate;
  const outputCost = (outToks / 1_000_000) * outRate;
  const total = inputCost + cachedInputCost + outputCost;
  const anyTokens = inToks + cacheToks + outToks > 0;
  return {
    finalCost: total,
    source: anyTokens ? "calculated" : "estimated",
    calculatedCost: total,
    inputCost,
    cachedInputCost,
    outputCost,
  };
}

/** Idempotently record one inference. Swallows errors so billing never blocks the caller. */
export async function recordInferenceServer(input: ServerRecordInferenceInput): Promise<void> {
  try {
    const admin = adminClient();
    if (!admin) return;

    const { data: run } = await admin
      .from("agent_runs")
      .select("id, user_id, session_id")
      .eq("id", input.runId)
      .maybeSingle();
    if (!run?.session_id) return;

    const model = (input.model ?? "unknown").toString();
    const pricing = await lookupPricing(admin, input.provider, model);
    const cost = computeCost(pricing, input);
    const now = input.completedAt ?? new Date().toISOString();

    const { data: upserted, error } = await admin
      .from("inferences")
      .upsert(
        {
          session_id: run.session_id,
          run_id: run.id,
          user_id: run.user_id,
          provider: input.provider,
          model,
          operation_type: input.operationType,
          external_request_id: input.externalRequestId ?? null,
          started_at: input.startedAt ?? now,
          completed_at: now,
          duration_ms: input.durationMs ?? null,
          input_tokens: input.inputTokens ?? null,
          cached_input_tokens: input.cachedInputTokens ?? null,
          output_tokens: input.outputTokens ?? null,
          input_cost_usd: cost.inputCost,
          cached_input_cost_usd: cost.cachedInputCost,
          output_cost_usd: cost.outputCost,
          provider_reported_cost_usd: input.providerReportedCostUsd ?? null,
          calculated_cost_usd: cost.calculatedCost,
          final_cost_usd: cost.finalCost,
          pricing_source: cost.source,
          pricing_id: pricing?.id ?? null,
          idempotency_key: input.idempotencyKey,
          metadata: input.metadata ?? {},
        },
        { onConflict: "provider,idempotency_key" },
      )
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("recordInferenceServer:", error.message);
      return;
    }

    await admin.from("provider_usage_events").upsert(
      {
        provider: input.provider,
        session_id: run.session_id,
        run_id: run.id,
        inference_id: upserted?.id ?? null,
        external_id: input.externalRequestId ?? input.idempotencyKey,
        event_type: "usage",
        payload: input.rawPayload ?? { note: "no raw payload captured" },
        processed_at: now,
      },
      { onConflict: "provider,external_id,event_type", ignoreDuplicates: true },
    );
  } catch (err) {
    console.warn("recordInferenceServer failed:", err);
  }
}

export function promptHash(prompt: string): string {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (Math.imul(31, h) + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export { estimateTokens };
