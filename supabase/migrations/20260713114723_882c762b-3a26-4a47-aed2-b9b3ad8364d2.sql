
-- Fix infinite recursion between enrollments and courses policies via SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION public.is_course_professor(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = _course_id AND c.professor_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_course_student(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = _course_id AND e.student_id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.is_course_professor(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_course_student(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_course_professor(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_course_student(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "enrollments: self-read" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments: professor writes" ON public.enrollments;
DROP POLICY IF EXISTS "enrollments: professor deletes" ON public.enrollments;

CREATE POLICY "enrollments: self-read" ON public.enrollments
FOR SELECT TO authenticated
USING (student_id = auth.uid() OR public.is_course_professor(course_id, auth.uid()));

CREATE POLICY "enrollments: professor writes" ON public.enrollments
FOR INSERT TO authenticated
WITH CHECK (public.is_course_professor(course_id, auth.uid()));

CREATE POLICY "enrollments: professor deletes" ON public.enrollments
FOR DELETE TO authenticated
USING (public.is_course_professor(course_id, auth.uid()));

DROP POLICY IF EXISTS "courses: student sees enrolled" ON public.courses;

CREATE POLICY "courses: student sees enrolled" ON public.courses
FOR SELECT TO authenticated
USING (public.is_course_student(id, auth.uid()));
