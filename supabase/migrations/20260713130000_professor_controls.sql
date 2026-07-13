-- Professor controls (Phase 8 of the college research workflow —
-- docs/research-workflow/07-professor-and-privacy.md), minimal viable set:
-- roles, courses with join codes, enrollments, assignments, and the
-- course-scoped cross-user read policies that let a professor follow
-- enrolled students' packet work. Students never see each other's work;
-- professors see student work only within their own courses.
--
-- All cross-table policy checks go through SECURITY DEFINER helper
-- functions: (a) to avoid RLS recursion between courses and enrollments,
-- and (b) so the professor policies on pieces/packets don't re-enter those
-- tables' own policies.

-- 1. Roles. Granting the professor role is a manual dashboard step (see
--    docs/RUNBOOK.md) — there is deliberately no self-service path.
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('professor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 2. Courses. The join code is how students enroll; it is not a secret
--    strong enough for anything else.
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL,
  name text NOT NULL,
  join_code text NOT NULL UNIQUE
    DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_professor_id_idx ON public.courses (professor_id);

REVOKE ALL ON public.courses FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- 3. Enrollments. Created only through the join_course() function below
--    (students never insert directly — they'd need to read the course row
--    to find its id, and course reads are member-scoped).
CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS enrollments_student_id_idx ON public.enrollments (student_id);
CREATE INDEX IF NOT EXISTS enrollments_course_id_idx ON public.enrollments (course_id);

REVOKE ALL ON public.enrollments FROM anon, authenticated;
GRANT SELECT, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- Recursion breakers (courses ↔ enrollments reference each other's rows).
CREATE OR REPLACE FUNCTION public.is_course_professor(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = _course_id AND professor_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_enrolled(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE course_id = _course_id AND student_id = _user_id
  );
$$;

-- Courses: professors manage their own; enrolled students can read theirs.
DROP POLICY IF EXISTS "Professors view own courses" ON public.courses;
CREATE POLICY "Professors view own courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (auth.uid() = professor_id OR public.is_enrolled(id, auth.uid()));

DROP POLICY IF EXISTS "Professors create courses" ON public.courses;
CREATE POLICY "Professors create courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = professor_id AND public.has_role(auth.uid(), 'professor'));

DROP POLICY IF EXISTS "Professors update own courses" ON public.courses;
CREATE POLICY "Professors update own courses"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (auth.uid() = professor_id)
  WITH CHECK (auth.uid() = professor_id);

DROP POLICY IF EXISTS "Professors delete own courses" ON public.courses;
CREATE POLICY "Professors delete own courses"
  ON public.courses FOR DELETE
  TO authenticated
  USING (auth.uid() = professor_id);

-- Enrollments: students see their own; professors see their course rosters.
DROP POLICY IF EXISTS "Members view enrollments" ON public.enrollments;
CREATE POLICY "Members view enrollments"
  ON public.enrollments FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id OR public.is_course_professor(course_id, auth.uid()));

-- Students may leave; professors may remove students from their courses.
DROP POLICY IF EXISTS "Members delete enrollments" ON public.enrollments;
CREATE POLICY "Members delete enrollments"
  ON public.enrollments FOR DELETE
  TO authenticated
  USING (auth.uid() = student_id OR public.is_course_professor(course_id, auth.uid()));

-- Enrollment by join code. SECURITY DEFINER so the student can enroll
-- without being able to read (or enumerate) course rows first.
CREATE OR REPLACE FUNCTION public.join_course(_code text)
RETURNS TABLE (course_id uuid, course_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  SELECT id, name INTO c FROM public.courses
  WHERE join_code = upper(trim(_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No course found for that code';
  END IF;
  INSERT INTO public.enrollments (course_id, student_id)
  VALUES (c.id, auth.uid())
  ON CONFLICT (course_id, student_id) DO NOTHING;
  RETURN QUERY SELECT c.id, c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.join_course(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.join_course(text) TO authenticated;

-- 4. Assignments: a topic plus configuration for the packets students
--    start from it. config keys (all optional): question_count,
--    followup ('required' | 'allowed' | 'off'), citation_style,
--    review_before_print (professor reviews questions before students print).
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignments_course_id_idx ON public.assignments (course_id);

REVOKE ALL ON public.assignments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view assignments" ON public.assignments;
CREATE POLICY "Members view assignments"
  ON public.assignments FOR SELECT
  TO authenticated
  USING (
    public.is_course_professor(course_id, auth.uid())
    OR public.is_enrolled(course_id, auth.uid())
  );

DROP POLICY IF EXISTS "Professors manage assignments" ON public.assignments;
CREATE POLICY "Professors manage assignments"
  ON public.assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_course_professor(course_id, auth.uid()));

DROP POLICY IF EXISTS "Professors edit assignments" ON public.assignments;
CREATE POLICY "Professors edit assignments"
  ON public.assignments FOR UPDATE
  TO authenticated
  USING (public.is_course_professor(course_id, auth.uid()))
  WITH CHECK (public.is_course_professor(course_id, auth.uid()));

DROP POLICY IF EXISTS "Professors delete assignments" ON public.assignments;
CREATE POLICY "Professors delete assignments"
  ON public.assignments FOR DELETE
  TO authenticated
  USING (public.is_course_professor(course_id, auth.uid()));

-- 5. Link student projects to assignments. Set only by the start-workflow
--    Edge Function (client INSERT on pieces is revoked), after verifying
--    the caller is enrolled in the assignment's course.
ALTER TABLE public.pieces ADD COLUMN IF NOT EXISTS assignment_id uuid
  REFERENCES public.assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pieces_assignment_id_idx ON public.pieces (assignment_id);

-- 6. Course-scoped professor reads over student packet work. SECURITY
--    DEFINER so these checks don't recurse into pieces/packets policies.
CREATE OR REPLACE FUNCTION public.is_piece_professor(_piece_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pieces pc
    JOIN public.assignments a ON a.id = pc.assignment_id
    JOIN public.courses c ON c.id = a.course_id
    WHERE pc.id = _piece_id AND c.professor_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_packet_professor(_packet_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.packets p
    JOIN public.pieces pc ON pc.id = p.piece_id
    JOIN public.assignments a ON a.id = pc.assignment_id
    JOIN public.courses c ON c.id = a.course_id
    WHERE p.id = _packet_id AND c.professor_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Professors view assignment pieces" ON public.pieces;
CREATE POLICY "Professors view assignment pieces"
  ON public.pieces FOR SELECT
  TO authenticated
  USING (public.is_piece_professor(id, auth.uid()));

DROP POLICY IF EXISTS "Professors view assignment packets" ON public.packets;
CREATE POLICY "Professors view assignment packets"
  ON public.packets FOR SELECT
  TO authenticated
  USING (public.is_piece_professor(piece_id, auth.uid()));

DROP POLICY IF EXISTS "Professors view assignment packet questions" ON public.packet_questions;
CREATE POLICY "Professors view assignment packet questions"
  ON public.packet_questions FOR SELECT
  TO authenticated
  USING (public.is_packet_professor(packet_id, auth.uid()));

-- The professor review capability (edit / lock / add) reuses the existing
-- packet review surface. Professor-added questions carry the professor's
-- user_id (source = 'user'); the existing owner policies already let each
-- author delete their own rows.
DROP POLICY IF EXISTS "Professors edit assignment packet questions" ON public.packet_questions;
CREATE POLICY "Professors edit assignment packet questions"
  ON public.packet_questions FOR UPDATE
  TO authenticated
  USING (public.is_packet_professor(packet_id, auth.uid()))
  WITH CHECK (public.is_packet_professor(packet_id, auth.uid()));

DROP POLICY IF EXISTS "Professors add assignment packet questions" ON public.packet_questions;
CREATE POLICY "Professors add assignment packet questions"
  ON public.packet_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_packet_professor(packet_id, auth.uid())
  );

-- Progress visibility only — returns carry status, not page content.
DROP POLICY IF EXISTS "Professors view assignment returns" ON public.packet_returns;
CREATE POLICY "Professors view assignment returns"
  ON public.packet_returns FOR SELECT
  TO authenticated
  USING (public.is_packet_professor(packet_id, auth.uid()));
