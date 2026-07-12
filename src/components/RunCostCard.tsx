import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getRunInferences, type InferenceRow } from "@/lib/costs.functions";
import { CostBadge, formatDuration, formatUsd } from "@/components/CostBadge";

function operationLabel(row: InferenceRow): string {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const subtype = typeof meta.subtype === "string" ? meta.subtype : null;
  if (subtype === "image_gen") return "image";
  if (subtype === "pdf_ocr") return "ocr";
  if (row.operation_type === "extract") return "research";
  if (row.provider === "cursor" && row.operation_type === "llm") return "agent";
  return row.operation_type;
}

function operationTitle(row: InferenceRow): string | undefined {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const note = typeof meta.token_note === "string" ? meta.token_note : null;
  if (note) return note;
  if (meta.subtype === "image_gen" && typeof meta.size === "string") {
    return `Generated image at ${meta.size}`;
  }
  if (meta.subtype === "pdf_ocr" && typeof meta.filename === "string") {
    return `OCR for ${meta.filename}`;
  }
  return undefined;
}

function hasEstimatedTokens(rows: InferenceRow[]): boolean {
  return rows.some((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return typeof meta.token_note === "string";
  });
}

export function RunCostCard({
  runId,
  sessionId,
  runCostUsd,
}: {
  runId: string;
  sessionId: string | null;
  runCostUsd: string | number;
}) {
  const fetchFn = useServerFn(getRunInferences);
  const { data, isLoading } = useQuery({
    queryKey: ["run-inferences", runId],
    queryFn: () => fetchFn({ data: { runId } }),
  });

  const infs = data?.inferences ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg">Cost</h2>
        {sessionId && (
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"
          >
            View session →
          </Link>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl tabular-nums">{formatUsd(runCostUsd)}</p>

      {isLoading && (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading cost breakdown">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      )}

      {!isLoading && infs.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          No billable inference recorded yet. Costs appear when the run reaches a terminal state.
        </p>
      )}

      {hasEstimatedTokens(infs) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Agent input tokens are a dispatch-prompt estimate. Cursor does not expose per-turn usage
          in API v0.
        </p>
      )}

      {!isLoading && infs.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Provider
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Model
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Op
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  In tok
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Out tok
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Duration
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Cost
                </th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {infs.map((i) => (
                <tr key={i.id} className="border-t border-border/50">
                  <td className="px-2 py-1.5">{i.provider}</td>
                  <td className="px-2 py-1.5">{i.model ?? "—"}</td>
                  <td className="px-2 py-1.5" title={operationTitle(i)}>
                    {operationLabel(i)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {i.input_tokens ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {i.output_tokens ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                    {formatDuration(i.duration_ms)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {formatUsd(i.final_cost_usd)}
                  </td>
                  <td className="px-2 py-1.5">
                    <CostBadge source={i.pricing_source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}