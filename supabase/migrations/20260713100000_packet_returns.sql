-- Packet returns (Phases 2–4 of the college research workflow —
-- docs/research-workflow/04-return-and-recognition.md). Additive only.
--
-- After working through the printed packet on paper, the student RETURNS
-- their work: photographed pages, dictated answers, or both. Recognition
-- (multimodal handwriting reading) is written by the packet-return Edge
-- Function with the service role; genuinely user-authored content
-- (dictation transcripts, verification corrections, the handwriting
-- profile) is client-writable under owner-scoped RLS, like packet_questions.
--
-- No job state lives here: recognition is synchronous inside the Edge
-- Function and its provider cost is recorded as an idempotent inference row
-- against the packet's generation run. Returning work never costs credits.

-- 1. Private storage bucket for photographed pages. Folder-scoped exactly
--    like research-attachments: the first path segment is auth.uid().
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('packet-returns', 'packet-returns', false, 20971520)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read own packet return images" ON storage.objects;
CREATE POLICY "Users read own packet return images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'packet-returns' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users upload own packet return images" ON storage.objects;
CREATE POLICY "Users upload own packet return images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'packet-returns' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own packet return images" ON storage.objects;
CREATE POLICY "Users delete own packet return images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'packet-returns' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. One return per packet: the student's returned work as a whole.
--    Retakes replace individual pages inside the same return. The owner
--    flips status collecting → verified after reviewing the transcription
--    (workflow state, not billing state — column-scoped like packets.status).
CREATE TABLE IF NOT EXISTS public.packet_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL UNIQUE REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'verified')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packet_returns_user_id_idx ON public.packet_returns (user_id);

REVOKE ALL ON public.packet_returns FROM anon, authenticated;
GRANT SELECT, INSERT ON public.packet_returns TO authenticated;
GRANT UPDATE (status, verified_at, updated_at) ON public.packet_returns TO authenticated;
GRANT ALL ON public.packet_returns TO service_role;

ALTER TABLE public.packet_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own packet returns" ON public.packet_returns;
CREATE POLICY "Users view own packet returns"
  ON public.packet_returns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT verifies the target packet belongs to the caller (same defense as
-- packet_questions: a guessed packet UUID must not let a stranger attach a
-- return to someone else's packet).
DROP POLICY IF EXISTS "Users open own packet returns" ON public.packet_returns;
CREATE POLICY "Users open own packet returns"
  ON public.packet_returns FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.packets p
      WHERE p.id = packet_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users verify own packet returns" ON public.packet_returns;
CREATE POLICY "Users verify own packet returns"
  ON public.packet_returns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Uploaded page images. Rows are written by the packet-return Edge
--    Function after the quality gate + recognition pass (service role);
--    the client may read and delete (retake flow) its own rows.
CREATE TABLE IF NOT EXISTS public.page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  page_number integer,
  status text NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'rejected', 'recognized')),
  -- Named quality problems from the gate (focus, glare, crop, …); empty when accepted.
  quality jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: re-processing the same uploaded file upserts, never duplicates.
  UNIQUE (return_id, storage_path)
);

CREATE INDEX IF NOT EXISTS page_images_return_id_idx ON public.page_images (return_id);

REVOKE ALL ON public.page_images FROM anon, authenticated;
GRANT SELECT, DELETE ON public.page_images TO authenticated;
GRANT ALL ON public.page_images TO service_role;

ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own page images" ON public.page_images;
CREATE POLICY "Users view own page images"
  ON public.page_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own page images" ON public.page_images;
CREATE POLICY "Users delete own page images"
  ON public.page_images FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Recognized handwriting blocks: what the system read on each page.
--    Written only by the Edge Function. Never presented as confirmed — the
--    verification screen requires the student's review; corrections live in
--    verification_corrections, keeping the machine reading and the student's
--    correction permanently distinct (provenance rule).
CREATE TABLE IF NOT EXISTS public.recognized_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_image_id uuid NOT NULL REFERENCES public.page_images(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  -- Approximate location in the printed page ("response area under Q3",
  -- "left margin beside S4P2").
  location text,
  text text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  annotation_type text NOT NULL DEFAULT 'response' CHECK (annotation_type IN (
    'response', 'margin_note', 'shorthand', 'underline', 'circle',
    'strikethrough', 'arrow', 'followup_question', 'other'
  )),
  interpretation text,
  interpretation_confidence numeric(3,2)
    CHECK (interpretation_confidence IS NULL
      OR (interpretation_confidence >= 0 AND interpretation_confidence <= 1)),
  linked_question_id uuid REFERENCES public.packet_questions(id) ON DELETE SET NULL,
  linked_anchor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_image_id, position)
);

CREATE INDEX IF NOT EXISTS recognized_blocks_return_id_idx ON public.recognized_blocks (return_id);

REVOKE ALL ON public.recognized_blocks FROM anon, authenticated;
GRANT SELECT ON public.recognized_blocks TO authenticated;
GRANT ALL ON public.recognized_blocks TO service_role;

ALTER TABLE public.recognized_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own recognized blocks" ON public.recognized_blocks;
CREATE POLICY "Users view own recognized blocks"
  ON public.recognized_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Dictation segments: the student's own spoken words, segmented with
--    their resolved packet references. User content — client-writable.
CREATE TABLE IF NOT EXISTS public.dictation_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  transcript text NOT NULL,
  -- Parsed reference targets: { page, question, anchor } where stated.
  resolved_target jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dictation_segments_return_id_idx
  ON public.dictation_segments (return_id);

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

-- 6. Verification corrections: the student's fixes to what the system read.
--    User content — client-writable. A correction never edits the
--    recognized block itself; the original machine reading is preserved.
CREATE TABLE IF NOT EXISTS public.verification_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  block_id uuid REFERENCES public.recognized_blocks(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES public.dictation_segments(id) ON DELETE CASCADE,
  corrected_text text,
  corrected_meaning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (block_id IS NOT NULL OR segment_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_corrections_block_unique
  ON public.verification_corrections (block_id) WHERE block_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS verification_corrections_segment_unique
  ON public.verification_corrections (segment_id) WHERE segment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS verification_corrections_return_id_idx
  ON public.verification_corrections (return_id);

REVOKE ALL ON public.verification_corrections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_corrections TO authenticated;
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

DROP POLICY IF EXISTS "Users edit own corrections" ON public.verification_corrections;
CREATE POLICY "Users edit own corrections"
  ON public.verification_corrections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own corrections" ON public.verification_corrections;
CREATE POLICY "Users delete own corrections"
  ON public.verification_corrections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 7. Handwriting profile (Phase 3, minimal): a compact text profile built
--    ONLY from the student's confirmed corrections, behind an explicit
--    consent gate. One row per user; deletable at any time (deletion stops
--    adaptation, never touches past work). Never applied to another user.
CREATE TABLE IF NOT EXISTS public.handwriting_profiles (
  user_id uuid PRIMARY KEY,
  profile_text text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.handwriting_profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handwriting_profiles TO authenticated;
GRANT ALL ON public.handwriting_profiles TO service_role;

ALTER TABLE public.handwriting_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own handwriting profile" ON public.handwriting_profiles;
CREATE POLICY "Users manage own handwriting profile"
  ON public.handwriting_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Pricing for the multimodal handwriting-recognition calls (same gateway
--    model as PDF OCR — already priced; row added defensively in case the
--    model differs later). No new row needed today: recognition reuses
--    lovable / google/gemini-2.5-flash from 20260712110000.
