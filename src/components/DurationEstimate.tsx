// "Usually X–Y minutes, based on recent runs." — rendered only when the
// run_duration_stats view has published stats for the kind (>= 10 measured
// completions). Otherwise renders nothing and the surrounding non-numeric
// copy stands alone. Phase C8 (audit P1.5).

import { useQuery } from "@tanstack/react-query";
import { formatDurationRange, getRunDurationStats } from "@/lib/run-duration";

export function DurationEstimate({
  kind,
  subject = "This step",
}: {
  kind: string;
  /** What the estimate covers, e.g. "The research pass" on the new page. */
  subject?: string;
}) {
  const { data } = useQuery({
    queryKey: ["run-duration-stats"],
    queryFn: getRunDurationStats,
    // Stats move slowly; don't refetch per page visit.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const stat = data?.[kind];
  if (!stat) return null;
  const range = formatDurationRange(stat.median_ms, stat.p75_ms);
  if (!range) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {subject} {range}, based on recent runs.
    </p>
  );
}
