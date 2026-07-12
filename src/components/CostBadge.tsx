import type { PricingSource } from "@/lib/costs.functions";

const LABELS: Record<PricingSource, string> = {
  provider_reported: "Exact",
  fixed_task_price: "Fixed task",
  calculated: "Calculated",
  estimated: "Estimated",
  manual: "Manual",
};

const TONES: Record<PricingSource, string> = {
  provider_reported: "bg-emerald-500/15 text-emerald-600",
  fixed_task_price: "bg-primary/15 text-primary",
  calculated: "bg-blue-500/15 text-blue-600",
  estimated: "bg-amber-500/15 text-amber-700",
  manual: "bg-muted text-muted-foreground",
};

export function CostBadge({ source }: { source: PricingSource }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TONES[source]}`}
      title={`Pricing source: ${source}`}
    >
      {LABELS[source]}
    </span>
  );
}

export function formatUsd(v: string | number | null | undefined): string {
  const n = v === null || v === undefined ? 0 : typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}