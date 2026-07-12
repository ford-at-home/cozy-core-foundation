
-- =====================================================================
-- 1. sessions
-- =====================================================================
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  piece_id uuid REFERENCES public.pieces(id) ON DELETE SET NULL,
  title text,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  run_count integer NOT NULL DEFAULT 0,
  inference_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_created_idx ON public.sessions (user_id, created_at DESC);
CREATE INDEX sessions_piece_idx ON public.sessions (piece_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions"
  ON public.sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions"
  ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions"
  ON public.sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 2. model_pricing (versioned)
-- =====================================================================
CREATE TABLE public.model_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  pricing_kind text NOT NULL CHECK (pricing_kind IN ('per_token','per_task')),
  input_price_per_million numeric(18,8),
  cached_input_price_per_million numeric(18,8),
  output_price_per_million numeric(18,8),
  per_task_price_usd numeric(18,8),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, effective_from)
);

CREATE INDEX model_pricing_lookup_idx
  ON public.model_pricing (provider, model, effective_from DESC);

GRANT SELECT ON public.model_pricing TO authenticated;
GRANT ALL ON public.model_pricing TO service_role;

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
-- Pricing is not user-owned; expose read-only to authenticated users.
CREATE POLICY "Anyone signed in can read pricing"
  ON public.model_pricing FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 3. inferences
-- =====================================================================
CREATE TABLE public.inferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  model text,
  operation_type text NOT NULL DEFAULT 'other'
    CHECK (operation_type IN ('llm','search','extract','crawl','embedding','rerank','tool','other')),
  external_request_id text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  input_cost_usd numeric(18,8),
  cached_input_cost_usd numeric(18,8),
  output_cost_usd numeric(18,8),
  provider_reported_cost_usd numeric(18,8),
  calculated_cost_usd numeric(18,8),
  final_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
  pricing_source text NOT NULL
    CHECK (pricing_source IN ('provider_reported','calculated','fixed_task_price','estimated','manual')),
  pricing_id uuid REFERENCES public.model_pricing(id),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, idempotency_key)
);

CREATE INDEX inferences_run_idx ON public.inferences (run_id, created_at);
CREATE INDEX inferences_session_idx ON public.inferences (session_id, created_at);
CREATE INDEX inferences_user_idx ON public.inferences (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inferences TO authenticated;
GRANT ALL ON public.inferences TO service_role;

ALTER TABLE public.inferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own inferences"
  ON public.inferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Writes are performed by service-role from backend; no user insert/update.

-- =====================================================================
-- 4. provider_usage_events
-- =====================================================================
CREATE TABLE public.provider_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  inference_id uuid REFERENCES public.inferences(id) ON DELETE SET NULL,
  external_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  UNIQUE (provider, external_id, event_type)
);

CREATE INDEX provider_usage_events_run_idx
  ON public.provider_usage_events (run_id, received_at);

GRANT SELECT ON public.provider_usage_events TO authenticated;
GRANT ALL ON public.provider_usage_events TO service_role;

ALTER TABLE public.provider_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage events"
  ON public.provider_usage_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_runs r
    WHERE r.id = provider_usage_events.run_id
      AND r.user_id = auth.uid()
  ));

-- =====================================================================
-- 5. Extend agent_runs
-- =====================================================================
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS total_cost_usd numeric(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms bigint,
  ADD COLUMN IF NOT EXISTS inference_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_summary text,
  ADD COLUMN IF NOT EXISTS output_summary text;

CREATE INDEX IF NOT EXISTS agent_runs_session_idx ON public.agent_runs (session_id, created_at);

-- =====================================================================
-- 6. Aggregation triggers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recompute_run_totals(_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total numeric(18,8);
  _count integer;
  _dur bigint;
BEGIN
  SELECT
    COALESCE(SUM(final_cost_usd), 0),
    COUNT(*),
    COALESCE(SUM(duration_ms), 0)
  INTO _total, _count, _dur
  FROM public.inferences
  WHERE run_id = _run_id;

  UPDATE public.agent_runs
     SET total_cost_usd  = _total,
         inference_count = _count,
         duration_ms = CASE
           WHEN dispatched_at IS NOT NULL AND completed_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (completed_at - dispatched_at)) * 1000
           ELSE COALESCE(duration_ms, _dur)
         END
   WHERE id = _run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_session_totals(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total numeric(18,8);
  _dur bigint;
  _runs integer;
  _inf integer;
  _all_terminal boolean;
  _any_failed boolean;
  _last_completed timestamptz;
BEGIN
  SELECT
    COALESCE(SUM(total_cost_usd), 0),
    COALESCE(SUM(duration_ms), 0),
    COUNT(*),
    COALESCE(SUM(inference_count), 0),
    BOOL_AND(status IN ('completed','failed','cancelled')),
    BOOL_OR(status = 'failed'),
    MAX(completed_at)
  INTO _total, _dur, _runs, _inf, _all_terminal, _any_failed, _last_completed
  FROM public.agent_runs
  WHERE session_id = _session_id;

  UPDATE public.sessions
     SET total_cost_usd = _total,
         total_duration_ms = _dur,
         run_count = _runs,
         inference_count = _inf,
         status = CASE
           WHEN _runs = 0 THEN 'pending'
           WHEN _all_terminal AND _any_failed THEN 'failed'
           WHEN _all_terminal THEN 'completed'
           ELSE 'running'
         END,
         completed_at = CASE WHEN _all_terminal THEN _last_completed ELSE NULL END,
         updated_at = now()
   WHERE id = _session_id;
END;
$$;

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
  RETURN NULL;
END;
$$;

CREATE TRIGGER inferences_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.inferences
FOR EACH ROW EXECUTE FUNCTION public.tg_inferences_after_change();

CREATE OR REPLACE FUNCTION public.tg_agent_runs_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
BEGIN
  _sid := COALESCE(NEW.session_id, OLD.session_id);
  IF _sid IS NOT NULL THEN
    PERFORM public.recompute_session_totals(_sid);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER agent_runs_after_change
AFTER INSERT OR UPDATE OF status, total_cost_usd, duration_ms, inference_count, completed_at, session_id
OR DELETE ON public.agent_runs
FOR EACH ROW EXECUTE FUNCTION public.tg_agent_runs_after_change();

-- =====================================================================
-- 7. Seed model_pricing (placeholders — edit in-DB anytime; historical
--    inferences pin the row they used via pricing_id.)
-- =====================================================================
INSERT INTO public.model_pricing
  (provider, model, pricing_kind, per_task_price_usd, effective_from, source_url, notes)
VALUES
  ('parallel','lite-fast','per_task',0.05,  now(), 'https://parallel.ai/pricing','Placeholder — verify current tier price'),
  ('parallel','base-fast','per_task',0.20,  now(), 'https://parallel.ai/pricing','Placeholder'),
  ('parallel','core-fast','per_task',0.60,  now(), 'https://parallel.ai/pricing','Placeholder'),
  ('parallel','pro-fast', 'per_task',1.50,  now(), 'https://parallel.ai/pricing','Placeholder'),
  ('parallel','ultra-fast','per_task',3.00, now(), 'https://parallel.ai/pricing','Placeholder — ultra-fast deep research'),
  ('cursor','default','per_task',0.75, now(), 'https://cursor.com/pricing','Placeholder per-agent flat rate — no per-run cost API today');

-- =====================================================================
-- 8. Backfill: create one session per existing piece, link runs
-- =====================================================================
INSERT INTO public.sessions (id, user_id, piece_id, title, status, started_at, completed_at, created_at)
SELECT
  gen_random_uuid(),
  p.user_id,
  p.id,
  p.title,
  'completed',
  p.created_at,
  p.updated_at,
  p.created_at
FROM public.pieces p
WHERE NOT EXISTS (
  SELECT 1 FROM public.sessions s WHERE s.piece_id = p.id
);

UPDATE public.agent_runs r
   SET session_id = s.id
  FROM public.sessions s
 WHERE s.piece_id = r.piece_id
   AND r.session_id IS NULL;

-- Standalone runs (no piece): one session each.
INSERT INTO public.sessions (id, user_id, title, status, started_at, completed_at, created_at)
SELECT gen_random_uuid(), r.user_id, 'Run ' || substring(r.id::text, 1, 8),
       CASE WHEN r.status IN ('completed','failed','cancelled') THEN r.status ELSE 'running' END,
       r.created_at, r.completed_at, r.created_at
FROM public.agent_runs r
WHERE r.session_id IS NULL AND r.piece_id IS NULL;

UPDATE public.agent_runs r
   SET session_id = s.id
  FROM public.sessions s
 WHERE r.session_id IS NULL
   AND r.piece_id IS NULL
   AND s.piece_id IS NULL
   AND s.user_id = r.user_id
   AND s.started_at = r.created_at;

-- Recompute session rollups now that runs are linked.
DO $$
DECLARE _sid uuid;
BEGIN
  FOR _sid IN SELECT id FROM public.sessions LOOP
    PERFORM public.recompute_session_totals(_sid);
  END LOOP;
END $$;
