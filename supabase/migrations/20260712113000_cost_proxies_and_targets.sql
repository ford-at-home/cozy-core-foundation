-- Cost calibration without architecture changes: proxy metrics on runs,
-- budget targets per business unit, and automatic proxy rollup from inferences.

-- =====================================================================
-- 1. workflow_cost_targets — planning budgets (editable in-DB anytime)
-- =====================================================================
CREATE TABLE public.workflow_cost_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL,
  target_usd numeric(18,8) NOT NULL,
  notes text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit, effective_from)
);

CREATE INDEX workflow_cost_targets_lookup_idx
  ON public.workflow_cost_targets (unit, effective_from DESC);

GRANT SELECT ON public.workflow_cost_targets TO authenticated;
GRANT ALL ON public.workflow_cost_targets TO service_role;

ALTER TABLE public.workflow_cost_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read cost targets"
  ON public.workflow_cost_targets FOR SELECT TO authenticated USING (true);

INSERT INTO public.workflow_cost_targets (unit, target_usd, notes)
VALUES
  ('full_piece', 2.00000000, 'Planning target: research → proposal → draft → revision for one piece'),
  ('research_run', 3.50000000, 'Planning target: Parallel ultra-fast deep research'),
  ('cursor_run', 0.75000000, 'Planning target: one Cursor Cloud Agent session (calibrate from invoices)'),
  ('proposal_run', 1.00000000, 'Planning target: compose/resynth agent run with typical research');

-- =====================================================================
-- 2. cost_proxies on agent_runs — calibration inputs (not invoice truth)
-- =====================================================================
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cost_proxies jsonb NOT NULL DEFAULT '{}'::jsonb;

-- =====================================================================
-- 3. recompute_run_cost_proxies — derived from input + inferences
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recompute_run_cost_proxies(_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _input jsonb;
  _duration bigint;
  _image_count integer;
  _ocr_count integer;
  _gateway_cost numeric(18,8);
  _cursor_count integer;
BEGIN
  SELECT input, duration_ms
    INTO _input, _duration
    FROM public.agent_runs
   WHERE id = _run_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE metadata->>'subtype' = 'image_gen'),
    COUNT(*) FILTER (WHERE metadata->>'subtype' = 'pdf_ocr'),
    COALESCE(SUM(final_cost_usd) FILTER (WHERE provider IN ('lovable', 'openai')), 0),
    COUNT(*) FILTER (WHERE provider = 'cursor')
  INTO _image_count, _ocr_count, _gateway_cost, _cursor_count
  FROM public.inferences
  WHERE run_id = _run_id;

  UPDATE public.agent_runs
     SET cost_proxies = jsonb_strip_nulls(jsonb_build_object(
       'prompt_est_tokens', NULLIF((_input->>'prompt_est_tokens')::bigint, 0),
       'prompt_chars', NULLIF((_input->>'prompt_chars')::bigint, 0),
       'research_chars', NULLIF((_input->>'research_chars')::bigint, 0),
       'duration_ms', _duration,
       'image_count', _image_count,
       'ocr_count', _ocr_count,
       'cursor_inference_count', _cursor_count,
       'gateway_cost_usd', _gateway_cost,
       'updated_at', to_jsonb(now())
     ))
   WHERE id = _run_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_run_cost_proxies(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_run_cost_proxies(uuid) TO service_role;

-- Extend inference trigger to refresh proxies after cost rollup.
CREATE OR REPLACE FUNCTION public.tg_inferences_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run_id uuid;
BEGIN
  _run_id := COALESCE(NEW.run_id, OLD.run_id);
  PERFORM public.recompute_run_totals(_run_id);
  PERFORM public.recompute_run_cost_proxies(_run_id);
  RETURN NULL;
END;
$$;

-- Refresh proxies when dispatch metadata or duration changes on the run row.
CREATE OR REPLACE FUNCTION public.tg_agent_runs_cost_proxies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.input IS DISTINCT FROM OLD.input
     OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms THEN
    PERFORM public.recompute_run_cost_proxies(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_cost_proxies ON public.agent_runs;
CREATE TRIGGER agent_runs_cost_proxies
AFTER INSERT OR UPDATE OF input, duration_ms ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_agent_runs_cost_proxies();

-- Backfill proxies for existing runs.
DO $$
DECLARE
  _rid uuid;
BEGIN
  FOR _rid IN SELECT id FROM public.agent_runs LOOP
    PERFORM public.recompute_run_cost_proxies(_rid);
  END LOOP;
END;
$$;
