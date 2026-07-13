// Client access to courses, enrollments, and assignments (Phase 8,
// minimal). Professors manage their own courses under RLS; students enroll
// through the join_course() database function (they never read course rows
// they aren't part of) and read assignments for their enrolled courses.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Course = {
  id: string;
  professor_id: string;
  name: string;
  join_code: string;
  created_at: string;
};

export type Enrollment = {
  id: string;
  course_id: string;
  student_id: string;
  created_at: string;
};

export type AssignmentConfig = {
  question_count?: number;
  followup?: "required" | "allowed" | "off";
  citation_style?: string;
  review_before_print?: boolean;
};

export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  topic: string;
  config: AssignmentConfig;
  created_at: string;
};

const db = supabase as unknown as SupabaseClient;

/** Whether the signed-in user holds the professor role. */
export async function isProfessor(): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "professor")
    .maybeSingle();
  if (error) return false;
  return data !== null;
}

// ---------------------------------------------------------------- courses

/** Courses the user can see: their own (professor) or enrolled (student). */
export async function listCourses(): Promise<Course[]> {
  const { data, error } = await db
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Course[];
}

export async function createCourse(name: string): Promise<Course> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const { data, error } = await db
    .from("courses")
    .insert({ professor_id: userData.user.id, name: name.trim() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Course;
}

/** Student enrollment by join code (SECURITY DEFINER database function). */
export async function joinCourse(code: string): Promise<{ courseId: string; courseName: string }> {
  const { data, error } = await db.rpc("join_course", { _code: code.trim() });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("No course found for that code");
  return { courseId: row.course_id as string, courseName: row.course_name as string };
}

export async function listRoster(courseId: string): Promise<Enrollment[]> {
  const { data, error } = await db
    .from("enrollments")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Enrollment[];
}

export async function listMyEnrollments(): Promise<Enrollment[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await db
    .from("enrollments")
    .select("*")
    .eq("student_id", userData.user.id);
  if (error) throw new Error(error.message);
  return (data ?? []) as Enrollment[];
}

// ------------------------------------------------------------- assignments

export async function listAssignments(courseId: string): Promise<Assignment[]> {
  const { data, error } = await db
    .from("assignments")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Assignment[];
}

export async function listAssignmentsForCourses(courseIds: string[]): Promise<Assignment[]> {
  if (courseIds.length === 0) return [];
  const { data, error } = await db
    .from("assignments")
    .select("*")
    .in("course_id", courseIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Assignment[];
}

export async function createAssignment(input: {
  courseId: string;
  title: string;
  topic: string;
  config: AssignmentConfig;
}): Promise<Assignment> {
  const { data, error } = await db
    .from("assignments")
    .insert({
      course_id: input.courseId,
      title: input.title.trim(),
      topic: input.topic.trim(),
      config: input.config,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await db.from("assignments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ------------------------------------------- professor progress overview

export type AssignmentPiece = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
};

/** Student projects started from an assignment (professor read policy). */
export async function listAssignmentPieces(assignmentId: string): Promise<AssignmentPiece[]> {
  const { data, error } = await db
    .from("pieces")
    .select("id, user_id, title, created_at")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AssignmentPiece[];
}
