import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type PricingSource =
  "provider_reported" | "calculated" | "fixed_task_price" | "estimated" | "manual";

export type SessionRow = {
  id: string;
  title: string | null;
  piece_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_cost_usd: string | number;
  total_duration_ms: number;
  run_count: number;
  inference_count: number;
  providers: string[];
};

export type SessionDetail = SessionRow & {
  runs: Array<{
    id: string;
    kind: string;
    status: string;
    provider: string | null;
    total_cost_usd: string | number;
    duration_ms: number | null;
    inference_count: number;
    created_at: string;
    completed_at: string | null;
  }>;
  byProvider: Record<string, number>;
  byPricingSource: Record<PricingSource, number>;
  byModel: Record<string, number>;
};

export type InferenceRow = {
  id: string;
  run_id: string;
  provider: string;
  model: string | null;
  operation_type: string;
  external_request_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  input_cost_usd: string | number | null;
  cached_input_cost_usd: string | number | null;
  output_cost_usd: string | number | null;
  provider_reported_cost_usd: string | number | null;
  calculated_cost_usd: string | number | null;
  final_cost_usd: string | number;
  pricing_source: PricingSource;
  metadata: Json | null;
  created_at: string;
};

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ sessions: SessionRow[] }> => {
    const { data: sessions, error } = await context.supabase
      .from("sessions")
      .select(
        "id, title, piece_id, status, started_at, completed_at, total_cost_usd, total_duration_ms, run_count, inference_count",
      )
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = (sessions ?? []).map((s) => s.id);
    const providerMap = new Map<string, Set<string>>();
    if (ids.length > 0) {
      const { data: runs } = await context.supabase
        .from("agent_runs")
        .select("session_id, provider, kind")
        .in("session_id", ids);
      for (const r of runs ?? []) {
        if (!r.session_id) continue;
        const set = providerMap.get(r.session_id) ?? new Set<string>();
        set.add(r.provider ?? (r.kind === "research" ? "parallel" : "cursor"));
        providerMap.set(r.session_id, set);
      }
    }

    return {
      sessions: (sessions ?? []).map((s) => ({
        ...s,
        providers: Array.from(providerMap.get(s.id) ?? []),
      })) as SessionRow[],
    };
  });

export const getSessionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId?: string }) => data ?? {})
  .handler(async ({ data, context }): Promise<SessionDetail | null> => {
    if (!data.sessionId) throw new Error("sessionId required");
    const { data: session, error } = await context.supabase
      .from("sessions")
      .select(
        "id, title, piece_id, status, started_at, completed_at, total_cost_usd, total_duration_ms, run_count, inference_count",
      )
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) return null;

    const { data: runs, error: runsError } = await context.supabase
      .from("agent_runs")
      .select(
        "id, kind, status, provider, total_cost_usd, duration_ms, inference_count, created_at, completed_at",
      )
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    if (runsError) throw new Error(runsError.message);

    const { data: infs, error: infsError } = await context.supabase
      .from("inferences")
      .select("provider, model, pricing_source, final_cost_usd")
      .eq("session_id", session.id);
    if (infsError) throw new Error(infsError.message);

    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byPricingSource: Record<PricingSource, number> = {
      provider_reported: 0,
      calculated: 0,
      fixed_task_price: 0,
      estimated: 0,
      manual: 0,
    };
    for (const i of infs ?? []) {
      const c = toNum(i.final_cost_usd as string | number);
      byProvider[i.provider] = (byProvider[i.provider] ?? 0) + c;
      const model = i.model ?? "unknown";
      byModel[model] = (byModel[model] ?? 0) + c;
      byPricingSource[i.pricing_source as PricingSource] += c;
    }

    const providers = Array.from(
      new Set(
        (runs ?? []).map((r) => r.provider ?? (r.kind === "research" ? "parallel" : "cursor")),
      ),
    );

    return {
      ...(session as any),
      providers,
      runs: (runs ?? []) as SessionDetail["runs"],
      byProvider,
      byPricingSource,
      byModel,
    };
  });

export const getRunInferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId?: string }) => data ?? {})
  .handler(async ({ data, context }): Promise<{ inferences: InferenceRow[] }> => {
    if (!data.runId) throw new Error("runId required");
    const { data: rows, error } = await context.supabase
      .from("inferences")
      .select(
        "id, run_id, provider, model, operation_type, external_request_id, started_at, completed_at, duration_ms, input_tokens, cached_input_tokens, output_tokens, input_cost_usd, cached_input_cost_usd, output_cost_usd, provider_reported_cost_usd, calculated_cost_usd, final_cost_usd, pricing_source, metadata, created_at",
      )
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { inferences: (rows ?? []) as InferenceRow[] };
  });
