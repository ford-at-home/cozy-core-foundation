-- Follow-up research (Phase 5 of the college research workflow —
-- docs/research-workflow/05-follow-up-research.md). Additive only.
--
-- After verifying their returned work, the student may submit up to three
-- follow-up questions for a focused second research pass (2 credits), which
-- chains into a revised packet (version n+1, linked via
-- packets.supersedes_packet_id). Skipping is explicit and free.

-- 1. New run kind: a follow-up research pass is a Parallel run like
--    kind='research', reconciled by the same research reconciler.
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('research', 'proposal', 'resynth', 'draft', 'revision', 'packet',
                  'followup_research'));

-- 2. Packets track where the follow-up decision stands. 'open' until the
--    student either skips (their explicit, free choice — column-scoped
--    client UPDATE) or research is dispatched (service role).
ALTER TABLE public.packets ADD COLUMN IF NOT EXISTS followup_state text NOT NULL DEFAULT 'open';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packets_followup_state_check') THEN
    ALTER TABLE public.packets ADD CONSTRAINT packets_followup_state_check
      CHECK (followup_state IN ('open', 'skipped', 'researching', 'researched'));
  END IF;
END $$;
GRANT UPDATE (followup_state) ON public.packets TO authenticated;

-- 3. Follow-up questions. The student's wording is user content
--    (client-writable under owner RLS). The refinement suggestion
--    (suggested_text) is machine-written by the packet-action Edge Function
--    and shown BESIDE the student's words — visible and consensual, never a
--    silent replacement. approved_text records exactly what was researched.
CREATE TABLE IF NOT EXISTS public.followup_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  student_text text NOT NULL,
  suggested_text text,
  approved_text text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'refined', 'approved', 'researched')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, position)
);

CREATE INDEX IF NOT EXISTS followup_questions_packet_id_idx
  ON public.followup_questions (packet_id);

REVOKE ALL ON public.followup_questions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.followup_questions TO authenticated;
-- The student edits their wording and approval; the machine's suggestion
-- column stays server-written.
GRANT UPDATE (student_text, approved_text, status, updated_at)
  ON public.followup_questions TO authenticated;
GRANT ALL ON public.followup_questions TO service_role;

ALTER TABLE public.followup_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own followup questions" ON public.followup_questions;
CREATE POLICY "Users view own followup questions"
  ON public.followup_questions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own followup questions" ON public.followup_questions;
CREATE POLICY "Users add own followup questions"
  ON public.followup_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packets p
      WHERE p.id = packet_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users edit own followup questions" ON public.followup_questions;
CREATE POLICY "Users edit own followup questions"
  ON public.followup_questions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own followup questions" ON public.followup_questions;
CREATE POLICY "Users delete own followup questions"
  ON public.followup_questions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
