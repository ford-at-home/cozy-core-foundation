// Client access to follow-up research (Phase 5). Question wording is user
// content (RLS-scoped writes); the refinement suggestion and the research
// dispatch go through the packet-action Edge Function.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/edge-error";

export const MAX_FOLLOWUP_QUESTIONS = 3;

export type FollowupQuestion = {
  id: string;
  packet_id: string;
  user_id: string;
  position: number;
  student_text: string;
  suggested_text: string | null;
  approved_text: string | null;
  status: "submitted" | "refined" | "approved" | "researched";
  created_at: string;
};

const db = supabase as unknown as SupabaseClient;

export async function listFollowupQuestions(packetId: string): Promise<FollowupQuestion[]> {
  const { data, error } = await db
    .from("followup_questions")
    .select("*")
    .eq("packet_id", packetId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowupQuestion[];
}

export async function addFollowupQuestion(packetId: string, text: string): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const existing = await listFollowupQuestions(packetId);
  if (existing.length >= MAX_FOLLOWUP_QUESTIONS) {
    throw new Error(`You can research up to ${MAX_FOLLOWUP_QUESTIONS} questions per pass.`);
  }
  const position = (existing[existing.length - 1]?.position ?? 0) + 1;
  const { error } = await db.from("followup_questions").insert({
    packet_id: packetId,
    user_id: userData.user.id,
    position,
    student_text: text.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function updateFollowupQuestionText(id: string, text: string): Promise<void> {
  const { error } = await db
    .from("followup_questions")
    .update({ student_text: text.trim(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFollowupQuestion(id: string): Promise<void> {
  const { error } = await db.from("followup_questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * The student's consent moment: approve this question for research, using
 * either their own wording or the suggested one — their explicit choice.
 */
export async function approveFollowupQuestion(
  q: FollowupQuestion,
  useSuggestion: boolean,
): Promise<void> {
  const approved = (useSuggestion && q.suggested_text ? q.suggested_text : q.student_text).trim();
  const { error } = await db
    .from("followup_questions")
    .update({
      approved_text: approved,
      status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", q.id);
  if (error) throw new Error(error.message);
}

export async function unapproveFollowupQuestion(id: string): Promise<void> {
  const { error } = await db
    .from("followup_questions")
    .update({ approved_text: null, status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Ask for sharper phrasings (free; shown beside the student's wording). */
export async function refineFollowups(packetId: string): Promise<{ refined: number }> {
  const { data, error } = await supabase.functions.invoke("packet-action", {
    body: { action: "refine_followups", packetId },
  });
  if (error) throw new Error(await extractEdgeError(error, "packet-action"));
  return data as { refined: number };
}

/** Dispatch the follow-up research pass (2 credits, covers the revised packet). */
export async function startFollowupResearch(
  packetId: string,
  requestId: string,
): Promise<{ runId: string }> {
  const { data, error } = await supabase.functions.invoke("packet-action", {
    body: { action: "start_followup_research", packetId, requestId },
  });
  if (error) throw new Error(await extractEdgeError(error, "packet-action"));
  return data as { runId: string };
}

// The client grant on packets is column-scoped (followup_state only), so
// these updates must not touch other columns — updated_at included.

/** The explicit, free skip: no follow-up research for this packet. */
export async function skipFollowup(packetId: string): Promise<void> {
  const { error } = await db
    .from("packets")
    .update({ followup_state: "skipped" })
    .eq("id", packetId);
  if (error) throw new Error(error.message);
}

/** Reopen a skipped follow-up decision. */
export async function reopenFollowup(packetId: string): Promise<void> {
  const { error } = await db.from("packets").update({ followup_state: "open" }).eq("id", packetId);
  if (error) throw new Error(error.message);
}
