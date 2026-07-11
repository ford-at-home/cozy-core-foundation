-- Phase B: durable job controller (plan v2 §data model).
--   * pieces: one row per piece; lifecycle across many runs.
--   * workflow_runs -> agent_runs: reshaped toward the Cursor Cloud Agents
--     provider model with an explicit dispatch-ambiguity state.
--   * agent_run_events: append-only audit/dedup log (webhooks are
--     at-least-once and unordered; edge logs are not durable).

-- ---------------------------------------------------------------- pieces

CREATE TABLE public.pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text,
  stage text NOT NULL DEFAULT 'research'
    CHECK (stage IN ('research','proposed','iterating','drafted','printed','annotating','finalized')),
  issue_number integer,
  draft_pr_url text,
  final_pr_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pieces TO authenticated;
GRANT ALL ON public.pieces TO service_role;

ALTER TABLE public.pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pieces"
  ON public.pieces FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own pieces"
  ON public.pieces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pieces"
  ON public.pieces FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX pieces_user_created_idx ON public.pieces (user_id, created_at DESC);

-- ------------------------------------------- workflow_runs -> agent_runs

ALTER TABLE public.workflow_runs RENAME TO agent_runs;
ALTER TABLE public.agent_runs RENAME COLUMN workflow_type TO kind;

-- Old rows: map the retired status vocabulary onto the new state machine.
ALTER TABLE public.agent_runs DROP CONSTRAINT workflow_runs_status_check;
UPDATE public.agent_runs SET status = CASE status
  WHEN 'queued' THEN 'requested'
  WHEN 'succeeded' THEN 'completed'
  WHEN 'canceled' THEN 'cancelled'
  ELSE status END;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_status_check CHECK (status IN (
  'requested','dispatching','dispatch_unknown','queued','running',
  'awaiting_fetch','completed','failed','cancel_requested','cancelled'
));

UPDATE public.agent_runs SET kind = 'proposal' WHERE kind = 'compose';
ALTER TABLE public.agent_runs ALTER COLUMN kind SET DEFAULT 'proposal';
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('proposal','resynth','draft','revision'));

ALTER TABLE public.agent_runs
  ADD COLUMN piece_id uuid REFERENCES public.pieces(id) ON DELETE SET NULL,
  -- App-owned idempotency: Cursor's API has no idempotency key (confirmed
  -- absent), so this unique key is the only double-dispatch guard.
  -- Nullable because pre-migration rows have none; every new insert sets it.
  ADD COLUMN idempotency_key text UNIQUE,
  ADD COLUMN external_agent_id text,          -- Cursor bc_... id
  ADD COLUMN external_run_id text,            -- reserved for Cursor v1 run API
  ADD COLUMN external_raw_status text,        -- verbatim vendor status, forward-compat
  ADD COLUMN branch text,                     -- where the agent wrote the files
  ADD COLUMN cancellation_status text NOT NULL DEFAULT 'none'
    CHECK (cancellation_status IN ('none','requested','confirmed','raced')),
  ADD COLUMN dispatched_at timestamptz;

CREATE INDEX agent_runs_external_agent_idx ON public.agent_runs (external_agent_id);
-- Reconciler scan: non-terminal runs only.
CREATE INDEX agent_runs_open_idx ON public.agent_runs (status, created_at)
  WHERE status NOT IN ('completed','failed','cancelled');

-- --------------------------------------------------------- event log

CREATE TABLE public.agent_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('edge','cursor-webhook','github-webhook','reconciler')),
  external_event_id text,                     -- X-Webhook-ID etc.; dedup key
  event_type text,
  payload jsonb,                              -- verbatim body, forward-compat audit
  received_at timestamptz NOT NULL DEFAULT now()
);

-- At-least-once delivery: same external event applied at most once per run.
CREATE UNIQUE INDEX agent_run_events_dedup_idx
  ON public.agent_run_events (run_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

GRANT SELECT ON public.agent_run_events TO authenticated;
GRANT ALL ON public.agent_run_events TO service_role;

ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;

-- Read-only for owners (diagnostics in the UI); only service role writes.
CREATE POLICY "Users can view events for their own runs"
  ON public.agent_run_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_runs r
    WHERE r.id = run_id AND r.user_id = auth.uid()
  ));

-- --------------------------------------------------------- realtime

-- agent_runs keeps its supabase_realtime membership through the rename
-- (publications track tables by identity, not name). Add pieces.
ALTER PUBLICATION supabase_realtime ADD TABLE public.pieces;
