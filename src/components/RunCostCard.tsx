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
  const { data } = useQuery({
    queryKey: ["run-inferences", runId],
    queryFn: () => fetchFn({ data: { runId } }),
  });

  const infs = data?.inferences ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg">Cost</h2>
        {sessionId && (
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId }}
            className="text-xs text-muted-foreground hover:underline"
          >
            View session →
          </Link>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl">{formatUsd(runCostUsd)}</p>

      {infs.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          No billable inference recorded yet. Costs are recorded when the run reaches a terminal state.
        </p>
      )}

      {hasEstimatedTokens(infs) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Agent input tokens are a dispatch-prompt estimate. Cursor does not expose per-turn usage in API v0.
        </p>
      )}

      {infs.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Provider</th>
                <th className="px-2 py-1 text-left">Model</th>
                <th className="px-2 py-1 text-left">Op</th>
                <th className="px-2 py-1 text-right">In tok</th>
                <th className="px-2 py-1 text-right">Out tok</th>
                <th className="px-2 py-1 text-right">Duration</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {infs.map((i) => (
                <tr key={i.id} className="border-t border-border/50">
                  <td className="px-2 py-1">{i.provider}</td>
                  <td className="px-2 py-1">{i.model ?? "—"}</td>
                  <td className="px-2 py-1" title={operationTitle(i)}>
                    {operationLabel(i)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {i.input_tokens ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {i.output_tokens ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {formatDuration(i.duration_ms)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {formatUsd(i.final_cost_usd)}
                  </td>
                  <td className="px-2 py-1">
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