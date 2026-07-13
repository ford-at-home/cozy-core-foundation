
-- 1) Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon/authenticated
REVOKE ALL ON FUNCTION public.grant_credits(uuid,integer,text,text,text,uuid,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_credits(uuid,integer,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_credits(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_reservation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_reservation(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_run_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_session_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_workflow_stage(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_agent_runs_after_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_inferences_after_change() FROM PUBLIC, anon, authenticated;

-- Role-check helpers: only signed-in users need them (for RLS evaluation); revoke from anon/public.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_course_professor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_course_professor(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_course_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_course_student(uuid, uuid) TO authenticated, service_role;

-- 2) Explicit deny policies on user_roles for INSERT/UPDATE/DELETE (defense in depth over fail-closed default).
DROP POLICY IF EXISTS "user_roles: deny client insert" ON public.user_roles;
CREATE POLICY "user_roles: deny client insert" ON public.user_roles
  FOR INSERT TO authenticated, anon WITH CHECK (false);

DROP POLICY IF EXISTS "user_roles: deny client update" ON public.user_roles;
CREATE POLICY "user_roles: deny client update" ON public.user_roles
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "user_roles: deny client delete" ON public.user_roles;
CREATE POLICY "user_roles: deny client delete" ON public.user_roles
  FOR DELETE TO authenticated, anon USING (false);

-- Ensure client roles cannot write to user_roles at the grant level either.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated, PUBLIC;
