// Cost-accounting write path: record one "inference" per billable
// provider unit, upsert by (provider, idempotency_key) so repeated
// polling / webhook redelivery never double-charges. Aggregation up to
// agent_runs and sessions happens in DB triggers.
//
// Precedence for final_cost_usd (spec):
//   provider_reported → fixed_task_price → calculated → estimated → manual

// deno-lint-ignore-file no-explicit-any

export type PricingSource =
  | "provider_reported"
  | "calculated"
  | "fixed_task_price"
  | "estimated"
  | "manual";

export type OperationType =
  | "llm"
  | "search"
  | "extract"
  | "crawl"
  | "embedding"
  | "rerank"
  | "tool"
  | "other";

export interface RecordInferenceInput {
  runId: string;
  provider: string;
  model?: string | null;
  operationType: OperationType;
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
}

interface PricingRow {
  id: string;
  pricing_kind: "per_token" | "per_task";
  per_task_price_usd: string | null;
  input_price_per_million: string | null;
  cached_input_price_per_million: string | null;
  output_price_per_million: string | null;
}

async function lookupPricing(
  admin: any,
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
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) return null;
  if (row.effective_to && new Date(row.effective_to).getTime() < Date.now()) {
    return null;
  }
  return row as PricingRow;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute cost from a pricing row + observed usage.
 * Returns { finalCost, source, calculatedCost, componentCosts }.
 */
export function computeCost(
  pricing: PricingRow | null,
  input: Pick<
    RecordInferenceInput,
    | "providerReportedCostUsd"
    | "inputTokens"
    | "cachedInputTokens"
    | "outputTokens"
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

  // per_token
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

/**
 * Idempotently record one inference and its audit event.
 * Returns the inference id (existing or new).
 */
export async function recordInference(
  admin: any,
  input: RecordInferenceInput,
): Promise<string | null> {
  // Resolve run → session/user (service-role bypasses RLS; we own the join).
  const { data: run } = await admin
    .from("agent_runs")
    .select("id, user_id, session_id")
    .eq("id", input.runId)
    .maybeSingle();
  if (!run?.session_id) return null; // can't record without a session

  const model = (input.model ?? "unknown").toString();
  const pricing = await lookupPricing(admin, input.provider, model);
  const cost = computeCost(pricing, input);

  const row = {
    session_id: run.session_id,
    run_id: run.id,
    user_id: run.user_id,
    provider: input.provider,
    model,
    operation_type: input.operationType,
    external_request_id: input.externalRequestId ?? null,
    started_at: input.startedAt ?? null,
    completed_at: input.completedAt ?? null,
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
  };

  const { data: upserted, error } = await admin
    .from("inferences")
    .upsert(row, { onConflict: "provider,idempotency_key" })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`recordInference: ${error.message}`);

  const inferenceId = upserted?.id ?? null;

  // Audit trail — dedup by (provider, external_id, event_type).
  await admin.from("provider_usage_events").upsert(
    {
      provider: input.provider,
      session_id: run.session_id,
      run_id: run.id,
      inference_id: inferenceId,
      external_id: input.externalRequestId ?? input.idempotencyKey,
      event_type: "usage",
      payload: input.rawPayload ?? { note: "no raw payload captured" },
      processed_at: new Date().toISOString(),
    },
    { onConflict: "provider,external_id,event_type", ignoreDuplicates: true },
  );

  return inferenceId;
}

/**
 * Attach a run to a session, creating a session if one doesn't already
 * exist for the piece. Called at run insert time.
 */
export async function ensureRunSession(
  admin: any,
  args: {
    runId: string;
    userId: string;
    pieceId: string | null;
    title?: string | null;
    provider?: string | null;
  },
): Promise<string | null> {
  const { runId, userId, pieceId, title, provider } = args;
  let sessionId: string | null = null;

  if (pieceId) {
    const { data: existing } = await admin
      .from("sessions")
      .select("id")
      .eq("piece_id", pieceId)
      .maybeSingle();
    sessionId = existing?.id ?? null;
    if (!sessionId) {
      const { data: created } = await admin
        .from("sessions")
        .insert({
          user_id: userId,
          piece_id: pieceId,
          title: title ?? null,
          status: "running",
        })
        .select("id")
        .single();
      sessionId = created?.id ?? null;
    }
  } else {
    const { data: created } = await admin
      .from("sessions")
      .insert({
        user_id: userId,
        title: title ?? null,
        status: "running",
      })
      .select("id")
      .single();
    sessionId = created?.id ?? null;
  }

  if (sessionId) {
    await admin
      .from("agent_runs")
      .update({
        session_id: sessionId,
        ...(provider ? { provider } : {}),
      })
      .eq("id", runId);
  }
  return sessionId;
}

/** Model slug stored on cursor inferences; env override or placeholder default. */
export function resolveCursorModel(): string {
  return Deno.env.get("AGENT_MODEL")?.trim() || "default";
}

/** Build cursor inference fields from a run row at completion time. */
export function cursorInferenceUsage(run: {
  id: string;
  kind: string;
  input?: Record<string, unknown> | null;
}): Pick<RecordInferenceInput, "model" | "inputTokens" | "metadata"> {
  const promptChars = typeof run.input?.prompt_chars === "number"
    ? run.input.prompt_chars
    : null;
  const promptEstTokens = typeof run.input?.prompt_est_tokens === "number"
    ? run.input.prompt_est_tokens
    : null;
  return {
    model: resolveCursorModel(),
    inputTokens: promptEstTokens,
    metadata: {
      billable_unit: "cursor_agent_run",
      kind: run.kind,
      prompt_chars: promptChars,
      prompt_est_tokens: promptEstTokens,
      token_note:
        "Input tokens are the dispatch-prompt estimate only. Cursor API v0 does not expose per-turn agent usage.",
    },
  };
}
