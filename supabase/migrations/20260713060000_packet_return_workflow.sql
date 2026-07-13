-- Research-packet return, verification, follow-up, and final-artifact model
-- (Phases 2-7 of docs/research-workflow/, schema per
-- docs/research-workflow/08-data-model-and-apis.md). Additive only; never
-- rewrites earlier migrations.
--
-- Job state stays in agent_runs (no new run states). These tables hold
-- domain data: what the student returned, what recognition read, what the
-- student verified, which follow-up questions were approved, and which
-- final artifacts were generated. Controller-ish rows (recognition results,
-- artifacts) are written by Edge Functions with the service role; genuinely
-- user-editable content (dictation, corrections, follow-up question text)
-- is client-writable under owner-scoped RLS, like packet_questions.

-- 1. New run kinds: follow-up research pass and document generation.
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN (
    'research', 'proposal', 'resynth', 'draft', 'revision', 'packet',
    'followup_research', 'docx', 'pptx'
  ));

-- 2. Packet returns: one submission attempt for a printed packet. The
-- student collects page photos and/or dictation under a return, recognition
-- runs against it, and verification approves it.
CREATE TABLE IF NOT EXISTS public.packet_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'photos' CHECK (method IN ('photos', 'dictation', 'mixed')),
  -- collecting: student is uploading/dictating. recognizing: recognition in
  -- flight (service role). needs_review: recognition done, verification
  -- pending. verified: the student approved the response set (authoritative
  -- student contribution). failed: recognition failed unrecoverably.
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN (
    'collecting', 'recognizing', 'needs_review', 'verified', 'failed'
  )),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packet_returns_packet_id_idx ON public.packet_returns (packet_id);
CREATE INDEX IF NOT EXISTS packet_returns_piece_id_idx ON public.packet_returns (piece_id);
CREATE INDEX IF NOT EXISTS packet_returns_user_id_idx ON public.packet_returns (user_id);

-- The owner creates a return and moves it collecting -> verified from the
-- review screen; recognizing/needs_review/failed are written by the
-- packet-return Edge Function (service role), which validates transitions.
REVOKE ALL ON public.packet_returns FROM anon, authenticated;
GRANT SELECT, INSERT ON public.packet_returns TO authenticated;
GRANT UPDATE (method, status, updated_at) ON public.packet_returns TO authenticated;
GRANT ALL ON public.packet_returns TO service_role;

ALTER TABLE public.packet_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own packet returns" ON public.packet_returns;
CREATE POLICY "Users view own packet returns"
  ON public.packet_returns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own packet returns" ON public.packet_returns;
CREATE POLICY "Users create own packet returns"
  ON public.packet_returns FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packets p
      WHERE p.id = packet_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own packet returns" ON public.packet_returns;
CREATE POLICY "Users update own packet returns"
  ON public.packet_returns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Page images: one uploaded photograph of one packet page, stored in the
-- private packet-returns bucket under the owner's folder.
CREATE TABLE IF NOT EXISTS public.page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  -- Printed folio number when known (student-declared or recognized).
  page_number integer,
  -- Display/processing order within the return (student can reorder).
  position integer NOT NULL DEFAULT 0,
  -- Quality-check output: { ok, issues: [{ code, message }] } — blur, glare,
  -- crop, contrast. Written by the packet-return Edge Function.
  quality jsonb,
  -- uploaded: registered, not yet checked. recognized: recognition produced
  -- blocks. rejected: quality too low, retake requested. failed: recognition
  -- errored for this page.
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN (
    'uploaded', 'recognized', 'rejected', 'failed'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id, storage_path)
);

CREATE INDEX IF NOT EXISTS page_images_return_id_idx ON public.page_images (return_id);
CREATE INDEX IF NOT EXISTS page_images_user_id_idx ON public.page_images (user_id);

-- The owner registers uploads, reorders pages, declares page numbers, and
-- removes retakes. Quality/status verdicts come from the Edge Function.
REVOKE ALL ON public.page_images FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.page_images TO authenticated;
GRANT UPDATE (page_number, position, updated_at) ON public.page_images TO authenticated;
GRANT ALL ON public.page_images TO service_role;

ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own page images" ON public.page_images;
CREATE POLICY "Users view own page images"
  ON public.page_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own page images" ON public.page_images;
CREATE POLICY "Users add own page images"
  ON public.page_images FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packet_returns r
      WHERE r.id = return_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users update own page images" ON public.page_images;
CREATE POLICY "Users update own page images"
  ON public.page_images FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own page images" ON public.page_images;
CREATE POLICY "Users delete own page images"
  ON public.page_images FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Recognized blocks: raw recognition output for one page image. Written
-- only by the packet-return Edge Function; never treated as verified. Each
-- recognition attempt appends a new set (attempt n+1) so earlier results
-- stay auditable; verification reads the latest attempt per page.
CREATE TABLE IF NOT EXISTS public.recognized_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_image_id uuid NOT NULL REFERENCES public.page_images(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  -- response: handwriting answering a question. annotation: a markup symbol
  -- (circle, arrow, underline, margin note). followup: a follow-up research
  -- question written in the F.1-F.3 areas. note: anything else handwritten.
  kind text NOT NULL DEFAULT 'response' CHECK (kind IN (
    'response', 'annotation', 'followup', 'note'
  )),
  -- Region on the page ({ area: 'q3' | 'margin' | ... } or coordinates)
  -- as reported by the recognizer.
  location jsonb,
  text text NOT NULL DEFAULT '',
  -- 0..1 recognizer confidence for the transcription; null when the region
  -- was detected but unreadable (never invented text).
  confidence numeric,
  annotation_type text,
  linked_question_id uuid REFERENCES public.packet_questions(id) ON DELETE SET NULL,
  -- S{n}P{m} anchor or Q/F identifier printed near the writing.
  linked_anchor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_image_id, attempt, position)
);

CREATE INDEX IF NOT EXISTS recognized_blocks_return_id_idx ON public.recognized_blocks (return_id);
CREATE INDEX IF NOT EXISTS recognized_blocks_page_image_id_idx ON public.recognized_blocks (page_image_id);

-- Read-only for the owner; all writes go through the Edge Function.
REVOKE ALL ON public.recognized_blocks FROM anon, authenticated;
GRANT SELECT ON public.recognized_blocks TO authenticated;
GRANT ALL ON public.recognized_blocks TO service_role;

ALTER TABLE public.recognized_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own recognized blocks" ON public.recognized_blocks;
CREATE POLICY "Users view own recognized blocks"
  ON public.recognized_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Dictation segments: transcript pieces the student dictated (or typed)
-- with the page/question/anchor they refer to. User content — full owner
-- CRUD, like packet_questions.
CREATE TABLE IF NOT EXISTS public.dictation_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  transcript text NOT NULL,
  -- Where the audio lives in packet-returns, when the recording was kept.
  audio_path text,
  -- Student-declared reference: { page, question, anchor, followup } —
  -- any subset.
  resolved_target jsonb,
  linked_question_id uuid REFERENCES public.packet_questions(id) ON DELETE SET NULL,
  -- draft until the student reviews the transcript; approved transcripts
  -- join the verified response set.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictation_segments_return_id_idx ON public.dictation_segments (return_id);

REVOKE ALL ON public.dictation_segments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dictation_segments TO authenticated;
GRANT ALL ON public.dictation_segments TO service_role;

ALTER TABLE public.dictation_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own dictation segments" ON public.dictation_segments;
CREATE POLICY "Users view own dictation segments"
  ON public.dictation_segments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own dictation segments" ON public.dictation_segments;
CREATE POLICY "Users add own dictation segments"
  ON public.dictation_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packet_returns r
      WHERE r.id = return_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users edit own dictation segments" ON public.dictation_segments;
CREATE POLICY "Users edit own dictation segments"
  ON public.dictation_segments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own dictation segments" ON public.dictation_segments;
CREATE POLICY "Users delete own dictation segments"
  ON public.dictation_segments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Verification corrections: the student's verdict on each recognized
-- block or dictation segment. Append-only user content: the latest row per
-- target wins; earlier rows keep the audit trail. A confirmed/corrected
-- target joins the authoritative verified response set.
CREATE TABLE IF NOT EXISTS public.verification_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  block_id uuid REFERENCES public.recognized_blocks(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES public.dictation_segments(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('confirm', 'correct', 'reject')),
  corrected_text text,
  corrected_meaning text,
  linked_question_id uuid REFERENCES public.packet_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (block_id IS NOT NULL OR segment_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS verification_corrections_return_id_idx
  ON public.verification_corrections (return_id);

REVOKE ALL ON public.verification_corrections FROM anon, authenticated;
GRANT SELECT, INSERT ON public.verification_corrections TO authenticated;
GRANT ALL ON public.verification_corrections TO service_role;

ALTER TABLE public.verification_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own corrections" ON public.verification_corrections;
CREATE POLICY "Users view own corrections"
  ON public.verification_corrections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own corrections" ON public.verification_corrections;
CREATE POLICY "Users add own corrections"
  ON public.verification_corrections FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packet_returns r
      WHERE r.id = return_id AND r.user_id = auth.uid()
    )
  );

-- 7. Follow-up research questions: up to three per packet, submitted after
-- verification. Question text is user content; 'researched' is written by
-- the follow-up Edge Function when the research pass dispatches.
CREATE TABLE IF NOT EXISTS public.followup_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  student_text text NOT NULL,
  -- Visible refinement (never an invisible rewrite): the suggested narrower
  -- wording and why. approved_text is set only when the student approves.
  suggested_text text,
  refinement_reason text,
  approved_text text,
  source text NOT NULL DEFAULT 'typed' CHECK (source IN (
    'handwriting', 'dictation', 'typed', 'suggested'
  )),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'refined', 'approved', 'researched'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, position)
);

CREATE INDEX IF NOT EXISTS followup_questions_packet_id_idx ON public.followup_questions (packet_id);
CREATE INDEX IF NOT EXISTS followup_questions_piece_id_idx ON public.followup_questions (piece_id);

REVOKE ALL ON public.followup_questions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_questions TO authenticated;
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

-- 8. Final artifacts: generated Word documents and presentations. Written
-- only by the generation Edge Function (service role); the owner reads and
-- downloads via signed URLs. Regenerating inserts a new row (versioned by
-- created_at); downloads are free.
CREATE TABLE IF NOT EXISTS public.final_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  packet_id uuid REFERENCES public.packets(id) ON DELETE SET NULL,
  run_id uuid UNIQUE REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('docx', 'pptx')),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  storage_path text,
  title text,
  -- Traceability: which analysis, verified responses, and follow-up findings
  -- fed this artifact (ids + counts, not copies).
  provenance jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS final_artifacts_piece_id_idx ON public.final_artifacts (piece_id);
CREATE INDEX IF NOT EXISTS final_artifacts_user_id_idx ON public.final_artifacts (user_id);

REVOKE ALL ON public.final_artifacts FROM anon, authenticated;
GRANT SELECT ON public.final_artifacts TO authenticated;
GRANT ALL ON public.final_artifacts TO service_role;

ALTER TABLE public.final_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own final artifacts" ON public.final_artifacts;
CREATE POLICY "Users view own final artifacts"
  ON public.final_artifacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 9. Storage: private buckets for returned pages (student uploads) and
-- generated artifacts (service-role writes, owner downloads).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('packet-returns', 'packet-returns', false, 15728640)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('final-artifacts', 'final-artifacts', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Folder-scoped access, same shape as research-attachments: the first path
-- segment must be the caller's user id.
DROP POLICY IF EXISTS "Users manage own packet return files" ON storage.objects;
CREATE POLICY "Users manage own packet return files"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'packet-returns'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'packet-returns'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Artifacts are written by the service role only; owners read (signed URLs).
DROP POLICY IF EXISTS "Users read own final artifacts" ON storage.objects;
CREATE POLICY "Users read own final artifacts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'final-artifacts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. Realtime for the workflow hub (live stage updates while recognition,
-- follow-up research, and artifact generation run).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'packet_returns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.packet_returns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'followup_questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_questions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'final_artifacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.final_artifacts;
  END IF;
END $$;
