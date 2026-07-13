
-- =========================================================================
-- Research workflow foundations (Phases B–G) — additive, idempotent
-- =========================================================================

-- ROLES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'professor', 'user');
  ELSE
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'professor'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles: self-read" ON public.user_roles;
CREATE POLICY "user_roles: self-read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- COURSES / ASSIGNMENTS / ENROLLMENTS — create all tables first, then policies.
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  term text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  prompt text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_course_idx ON public.assignments(course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
CREATE INDEX IF NOT EXISTS enrollments_student_idx ON public.enrollments(student_id);
GRANT SELECT, INSERT, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses: professor owns" ON public.courses;
CREATE POLICY "courses: professor owns" ON public.courses FOR ALL TO authenticated
  USING (professor_id = auth.uid() AND public.has_role(auth.uid(), 'professor'))
  WITH CHECK (professor_id = auth.uid() AND public.has_role(auth.uid(), 'professor'));

DROP POLICY IF EXISTS "courses: student sees enrolled" ON public.courses;
CREATE POLICY "courses: student sees enrolled" ON public.courses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = courses.id AND e.student_id = auth.uid()));

DROP POLICY IF EXISTS "assignments: professor owns" ON public.assignments;
CREATE POLICY "assignments: professor owns" ON public.assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = assignments.course_id AND c.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = assignments.course_id AND c.professor_id = auth.uid()));

DROP POLICY IF EXISTS "assignments: student sees enrolled" ON public.assignments;
CREATE POLICY "assignments: student sees enrolled" ON public.assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = assignments.course_id AND e.student_id = auth.uid()));

DROP POLICY IF EXISTS "enrollments: self-read" ON public.enrollments;
CREATE POLICY "enrollments: self-read" ON public.enrollments FOR SELECT TO authenticated
  USING (student_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.courses c WHERE c.id = enrollments.course_id AND c.professor_id = auth.uid()));

DROP POLICY IF EXISTS "enrollments: professor writes" ON public.enrollments;
CREATE POLICY "enrollments: professor writes" ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = enrollments.course_id AND c.professor_id = auth.uid()));

DROP POLICY IF EXISTS "enrollments: professor deletes" ON public.enrollments;
CREATE POLICY "enrollments: professor deletes" ON public.enrollments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = enrollments.course_id AND c.professor_id = auth.uid()));

-- Link pieces to an optional assignment; professor visibility.
ALTER TABLE public.pieces ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pieces_assignment_idx ON public.pieces(assignment_id);

DROP POLICY IF EXISTS "pieces: professor reads assigned" ON public.pieces;
CREATE POLICY "pieces: professor reads assigned" ON public.pieces FOR SELECT TO authenticated
  USING (assignment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id
    WHERE a.id = pieces.assignment_id AND c.professor_id = auth.uid()));

-- WORKFLOW STAGE FSM ------------------------------------------------------
ALTER TABLE public.pieces ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'draft';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pieces_workflow_stage_check') THEN
    ALTER TABLE public.pieces ADD CONSTRAINT pieces_workflow_stage_check CHECK (workflow_stage IN (
      'draft','initial_research_pending','initial_research_running','research_ready',
      'packet_pending','packet_ready','awaiting_student_return','student_return_received',
      'recognition_running','responses_need_review','responses_verified',
      'follow_up_questions_ready','follow_up_research_running','follow_up_research_ready',
      'final_document_pending','final_document_ready','presentation_pending','presentation_ready',
      'complete','failed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.advance_workflow_stage(_piece_id uuid, _to text, _actor uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _current text; _allowed boolean;
BEGIN
  SELECT workflow_stage INTO _current FROM public.pieces WHERE id = _piece_id FOR UPDATE;
  IF _current IS NULL THEN RAISE EXCEPTION 'advance_workflow_stage: piece % not found', _piece_id; END IF;
  _allowed := CASE _current
    WHEN 'draft' THEN _to IN ('initial_research_pending','failed')
    WHEN 'initial_research_pending' THEN _to IN ('initial_research_running','failed')
    WHEN 'initial_research_running' THEN _to IN ('research_ready','failed')
    WHEN 'research_ready' THEN _to IN ('packet_pending','failed')
    WHEN 'packet_pending' THEN _to IN ('packet_ready','failed')
    WHEN 'packet_ready' THEN _to IN ('awaiting_student_return','failed','complete')
    WHEN 'awaiting_student_return' THEN _to IN ('student_return_received','failed')
    WHEN 'student_return_received' THEN _to IN ('recognition_running','failed')
    WHEN 'recognition_running' THEN _to IN ('responses_need_review','failed')
    WHEN 'responses_need_review' THEN _to IN ('responses_verified','failed')
    WHEN 'responses_verified' THEN _to IN ('follow_up_questions_ready','final_document_pending','complete','failed')
    WHEN 'follow_up_questions_ready' THEN _to IN ('follow_up_research_running','final_document_pending','failed')
    WHEN 'follow_up_research_running' THEN _to IN ('follow_up_research_ready','failed')
    WHEN 'follow_up_research_ready' THEN _to IN ('final_document_pending','failed')
    WHEN 'final_document_pending' THEN _to IN ('final_document_ready','failed')
    WHEN 'final_document_ready' THEN _to IN ('presentation_pending','complete','failed')
    WHEN 'presentation_pending' THEN _to IN ('presentation_ready','failed')
    WHEN 'presentation_ready' THEN _to IN ('complete','failed')
    WHEN 'failed' THEN _to IN ('draft')
    WHEN 'complete' THEN false
    ELSE false END;
  IF NOT _allowed THEN RAISE EXCEPTION 'invalid_workflow_transition: % -> %', _current, _to USING ERRCODE = 'P0001'; END IF;
  UPDATE public.pieces SET workflow_stage = _to, updated_at = now() WHERE id = _piece_id;
  RETURN _to;
END; $$;

REVOKE EXECUTE ON FUNCTION public.advance_workflow_stage(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_workflow_stage(uuid, text, uuid) TO service_role;

-- Extend agent_runs.kind to allow new run kinds
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('research','proposal','resynth','draft','revision','packet','followup_research','final_docx','final_pptx'));

-- RETURN & RECOGNITION ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packet_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','recognizing','ready','failed')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS packet_returns_packet_idx ON public.packet_returns(packet_id);
CREATE INDEX IF NOT EXISTS packet_returns_user_idx ON public.packet_returns(user_id, created_at DESC);
GRANT SELECT ON public.packet_returns TO authenticated;
GRANT ALL ON public.packet_returns TO service_role;
ALTER TABLE public.packet_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "packet_returns: owner read" ON public.packet_returns;
CREATE POLICY "packet_returns: owner read" ON public.packet_returns FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  page_number integer,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','analyzing','analyzed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_images_return_idx ON public.page_images(return_id);
GRANT SELECT ON public.page_images TO authenticated;
GRANT ALL ON public.page_images TO service_role;
ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "page_images: owner read" ON public.page_images;
CREATE POLICY "page_images: owner read" ON public.page_images FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.recognized_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_image_id uuid NOT NULL REFERENCES public.page_images(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  text text NOT NULL DEFAULT '',
  confidence real NOT NULL DEFAULT 0,
  annotation_type text CHECK (annotation_type IN ('response','margin_note','underline','circle','arrow','other')),
  interpretation_confidence real,
  linked_question_id uuid REFERENCES public.packet_questions(id) ON DELETE SET NULL,
  linked_anchor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recognized_blocks_page_idx ON public.recognized_blocks(page_image_id);
CREATE INDEX IF NOT EXISTS recognized_blocks_question_idx ON public.recognized_blocks(linked_question_id);
GRANT SELECT ON public.recognized_blocks TO authenticated;
GRANT ALL ON public.recognized_blocks TO service_role;
ALTER TABLE public.recognized_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recognized_blocks: owner read" ON public.recognized_blocks;
CREATE POLICY "recognized_blocks: owner read" ON public.recognized_blocks FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.dictation_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES public.packet_returns(id) ON DELETE CASCADE,
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript text NOT NULL DEFAULT '',
  resolved_target jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_order integer NOT NULL DEFAULT 0,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dictation_segments_packet_idx ON public.dictation_segments(packet_id, segment_order);
GRANT SELECT ON public.dictation_segments TO authenticated;
GRANT ALL ON public.dictation_segments TO service_role;
ALTER TABLE public.dictation_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dictation_segments: owner read" ON public.dictation_segments;
CREATE POLICY "dictation_segments: owner read" ON public.dictation_segments FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.verification_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid REFERENCES public.recognized_blocks(id) ON DELETE CASCADE,
  segment_id uuid REFERENCES public.dictation_segments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  corrected_text text NOT NULL,
  corrected_meaning jsonb,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (block_id IS NOT NULL OR segment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS verification_corrections_block_idx ON public.verification_corrections(block_id);
CREATE INDEX IF NOT EXISTS verification_corrections_segment_idx ON public.verification_corrections(segment_id);
GRANT SELECT ON public.verification_corrections TO authenticated;
GRANT ALL ON public.verification_corrections TO service_role;
ALTER TABLE public.verification_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "verification_corrections: owner read" ON public.verification_corrections;
CREATE POLICY "verification_corrections: owner read" ON public.verification_corrections FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.handwriting_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_text text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.handwriting_profiles TO authenticated;
GRANT ALL ON public.handwriting_profiles TO service_role;
ALTER TABLE public.handwriting_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "handwriting_profiles: self" ON public.handwriting_profiles;
CREATE POLICY "handwriting_profiles: self" ON public.handwriting_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- FOLLOW-UP QUESTIONS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.followup_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 3),
  student_text text NOT NULL,
  suggested_text text,
  approved_text text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','refined','approved','researched')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, position)
);
CREATE INDEX IF NOT EXISTS followup_questions_user_idx ON public.followup_questions(user_id, created_at DESC);
GRANT SELECT ON public.followup_questions TO authenticated;
GRANT ALL ON public.followup_questions TO service_role;
ALTER TABLE public.followup_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "followup_questions: owner read" ON public.followup_questions;
CREATE POLICY "followup_questions: owner read" ON public.followup_questions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- FINAL ARTIFACTS + STUDENT CONTRIBUTIONS --------------------------------
CREATE TABLE IF NOT EXISTS public.final_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('docx','pptx','visual')),
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS final_artifacts_piece_idx ON public.final_artifacts(piece_id, kind);
GRANT SELECT ON public.final_artifacts TO authenticated;
GRANT ALL ON public.final_artifacts TO service_role;
ALTER TABLE public.final_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "final_artifacts: owner read" ON public.final_artifacts;
CREATE POLICY "final_artifacts: owner read" ON public.final_artifacts FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.student_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reflection','style_sample','decision')),
  text text NOT NULL,
  source text NOT NULL DEFAULT 'direct' CHECK (source IN ('handwriting','dictation','direct')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_contributions_packet_idx ON public.student_contributions(packet_id);
GRANT SELECT, INSERT ON public.student_contributions TO authenticated;
GRANT ALL ON public.student_contributions TO service_role;
ALTER TABLE public.student_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_contributions: owner" ON public.student_contributions;
CREATE POLICY "student_contributions: owner" ON public.student_contributions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- PIECE EVENTS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.piece_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT 'system',
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS piece_events_piece_idx ON public.piece_events(piece_id, created_at DESC);
GRANT SELECT ON public.piece_events TO authenticated;
GRANT ALL ON public.piece_events TO service_role;
ALTER TABLE public.piece_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "piece_events: owner read" ON public.piece_events;
CREATE POLICY "piece_events: owner read" ON public.piece_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- STORAGE POLICIES for private buckets: path prefix = {auth.uid()}/…
DO $$
DECLARE bucket text;
BEGIN
  FOREACH bucket IN ARRAY ARRAY['packet-returns','dictation-audio','final-artifacts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || ': owner read');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || ': owner write');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', bucket || ': owner delete');
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || ': owner read', bucket);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || ': owner write', bucket);
    EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)', bucket || ': owner delete', bucket);
  END LOOP;
END $$;
