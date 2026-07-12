-- Deep-research entry point: a piece can now start from a topic instead of
-- pasted research. A 'research' run is executed by Parallel AI (Task API),
-- polled by the reconciler, and chained into a 'proposal' run on completion.

ALTER TABLE public.agent_runs DROP CONSTRAINT agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('research','proposal','resynth','draft','revision'));

-- The reconciler correlates research runs by the Parallel run id.
CREATE INDEX IF NOT EXISTS agent_runs_external_run_id_idx
  ON public.agent_runs (external_run_id)
  WHERE external_run_id IS NOT NULL;
