-- Research packets (Phase 1 of the college research workflow —
-- docs/research-workflow/). Additive only; do not rewrite earlier migrations.

ALTER TABLE public.pieces ADD COLUMN IF NOT EXISTS workflow text NOT NULL DEFAULT 'longform';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pieces_workflow_check') THEN
    ALTER TABLE public.pieces ADD CONSTRAINT pieces_workflow_check
      CHECK (workflow IN ('longform', 'research_packet'));
  END IF;
END $$;

ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('research', 'proposal', 'resynth', 'draft', 'revision', 'packet'));

CREATE TABLE IF NOT EXISTS public.packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  supersedes_packet_id uuid REFERENCES public.packets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'reviewed')),
  analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packets_piece_id_idx ON public.packets (piece_id);
CREATE INDEX IF NOT EXISTS packets_user_id_idx ON public.packets (user_id);

REVOKE ALL ON public.packets FROM anon, authenticated;
GRANT SELECT ON public.packets TO authenticated;
GRANT UPDATE (status) ON public.packets TO authenticated;
GRANT ALL ON public.packets TO service_role;

ALTER TABLE public.packets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own packets" ON public.packets;
CREATE POLICY "Users view own packets"
  ON public.packets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users review own packets" ON public.packets;
CREATE POLICY "Users review own packets"
  ON public.packets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.packet_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  function text NOT NULL CHECK (function IN (
    'prior_belief', 'stakes', 'evidence_integrity', 'missing_perspective',
    'ground_truth', 'expert_interrogation', 'counterargument',
    'definition_framing', 'action', 'followup'
  )),
  claim_ref text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  guidance text,
  response_space text NOT NULL DEFAULT 'lines_5' CHECK (response_space IN (
    'lines_3', 'lines_5', 'third_page', 'half_page', 'box'
  )),
  locked boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'user')),
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, position)
);

CREATE INDEX IF NOT EXISTS packet_questions_packet_id_idx ON public.packet_questions (packet_id);

REVOKE ALL ON public.packet_questions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packet_questions TO authenticated;
GRANT ALL ON public.packet_questions TO service_role;

ALTER TABLE public.packet_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own packet questions" ON public.packet_questions;
CREATE POLICY "Users view own packet questions"
  ON public.packet_questions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own packet questions" ON public.packet_questions;
CREATE POLICY "Users add own packet questions"
  ON public.packet_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packets p
      WHERE p.id = packet_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users edit own packet questions" ON public.packet_questions;
CREATE POLICY "Users edit own packet questions"
  ON public.packet_questions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packets p
      WHERE p.id = packet_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users delete own packet questions" ON public.packet_questions;
CREATE POLICY "Users delete own packet questions"
  ON public.packet_questions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);