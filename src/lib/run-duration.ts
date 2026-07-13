// Honest duration estimates (audit P1.5 numeric half / plan phase C8).
//
// Reads the run_duration_stats view — median/p75 duration per completed run
// kind, published by the DB only once a kind has >= 10 real samples. Until
// then the view returns nothing and the UI keeps its non-numeric copy, so a
// number shown to a user is always backed by measured runs, never invented.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RunDurationStat = {
  kind: string;
  sample_count: number;
  median_ms: number;
  p75_ms: number;
};

// Untyped view of the client: the generated types don't include views.
const db = supabase as unknown as SupabaseClient;

export async function getRunDurationStats(): Promise<Record<string, RunDurationStat>> {
  const { data, error } = await db
    .from("run_duration_stats")
    .select("kind, sample_count, median_ms, p75_ms");
  if (error) throw new Error(error.message);
  const byKind: Record<string, RunDurationStat> = {};
  for (const row of (data ?? []) as RunDurationStat[]) byKind[row.kind] = row;
  return byKind;
}

/**
 * "usually 5–8 minutes" / "usually about 6 minutes" / "usually under a
 * minute" — median–p75 rounded to whole minutes. Returns null for
 * non-positive input so callers can fall back to non-numeric copy.
 */
export function formatDurationRange(medianMs: number, p75Ms: number): string | null {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return null;
  const lo = Math.max(1, Math.round(medianMs / 60_000));
  const hi = Math.max(lo, Math.round(Math.max(medianMs, p75Ms) / 60_000));
  if (medianMs < 45_000 && p75Ms < 90_000) return "usually under a minute";
  if (lo === hi) return `usually about ${lo} minute${lo === 1 ? "" : "s"}`;
  return `usually ${lo}\u2013${hi} minutes`;
}
