-- Run durations: fix duration_ms = 0 and add honest duration stats
-- (audit P0 duration defect + P1.5 numeric half — plan phase C8).
--
-- Root cause (confirmed live in WI-0005/L7): duration_ms is only computed
-- inside recompute_run_totals, which fires exclusively from inferences
-- changes. Completion paths record inferences BEFORE setting completed_at,
-- so the dispatched_at/completed_at branch never sees both timestamps and
-- every kind except 'revision' lands with duration_ms = 0.

-- ---------------------------------------------------------------------
-- 1. Stamp duration_ms whenever completed_at is set (any path: webhook,
--    reconciler, edge function). BEFORE trigger — mutates the row in
--    flight, no extra UPDATE, no recursion.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_agent_runs_set_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.dispatched_at IS NOT NULL THEN
    NEW.duration_ms := GREATEST(
      0,
      (EXTRACT(EPOCH FROM (NEW.completed_at - NEW.dispatched_at)) * 1000)::bigint
    );
  END IF;
  RETURN NEW;
END;
$$;

-- House style (matches the other trigger functions): trigger-typed
-- functions can't be called from SQL anyway, but keep EXECUTE revoked.
REVOKE EXECUTE ON FUNCTION public.tg_agent_runs_set_duration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agent_runs_set_duration ON public.agent_runs;
CREATE TRIGGER agent_runs_set_duration
BEFORE INSERT OR UPDATE OF completed_at, dispatched_at ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_agent_runs_set_duration();

-- ---------------------------------------------------------------------
-- 2. Backfill existing terminal rows (idempotent: recomputes the same
--    value on replay). The resulting UPDATE also refreshes session
--    rollups via the existing agent_runs_after_change trigger.
-- ---------------------------------------------------------------------
UPDATE public.agent_runs
   SET duration_ms = GREATEST(
     0,
     (EXTRACT(EPOCH FROM (completed_at - dispatched_at)) * 1000)::bigint
   )
 WHERE completed_at IS NOT NULL
   AND dispatched_at IS NOT NULL
   AND COALESCE(duration_ms, 0) = 0;

-- ---------------------------------------------------------------------
-- 3. Duration stats view: median/p75 per completed kind, published only
--    once a kind has >= 10 samples (the UI shows non-numeric copy until
--    then). Deliberately a definer-rights view: it exposes cross-user
--    AGGREGATES ONLY (kind, counts, milliseconds — no ids, no content),
--    which is exactly what "usually X-Y minutes, based on recent runs"
--    needs. Only completed runs with a real measured duration count.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.run_duration_stats AS
SELECT
  kind,
  COUNT(*)::integer AS sample_count,
  (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms))::bigint AS median_ms,
  (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_ms))::bigint AS p75_ms
FROM public.agent_runs
WHERE status = 'completed'
  AND duration_ms IS NOT NULL
  AND duration_ms > 0
GROUP BY kind
HAVING COUNT(*) >= 10;

GRANT SELECT ON public.run_duration_stats TO authenticated;
