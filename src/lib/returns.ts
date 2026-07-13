// Client access to the packet-return tables (Phase 2–4 of
// docs/research-workflow/). Reads and user-content writes go through RLS
// (owner-scoped). Machine writes (page images, recognized blocks) come from
// the packet-return Edge Function; this module only calls it.
//
// Like src/lib/packets.ts, the generated Supabase types don't include these
// tables yet, so this module is the single place that casts around them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/edge-error";
import { segmentDictation, type DictationTarget } from "@/lib/return-mapping";

export type PacketReturn = {
  id: string;
  packet_id: string;
  user_id: string;
  status: "collecting" | "verified";
  verified_at: string | null;
  created_at: string;
};

export type PageImage = {
  id: string;
  return_id: string;
  user_id: string;
  storage_path: string;
  page_number: number | null;
  status: "reading" | "rejected" | "recognized";
  quality: { ok: boolean; problems: string[] } | null;
  created_at: string;
};

export type RecognizedBlock = {
  id: string;
  page_image_id: string;
  return_id: string;
  user_id: string;
  position: number;
  location: string | null;
  text: string;
  confidence: number;
  annotation_type: string;
  interpretation: string | null;
  interpretation_confidence: number | null;
  linked_question_id: string | null;
  linked_anchor: string | null;
};

export type DictationSegment = {
  id: string;
  return_id: string;
  user_id: string;
  position: number;
  transcript: string;
  resolved_target: DictationTarget | null;
};

export type VerificationCorrection = {
  id: string;
  return_id: string;
  user_id: string;
  block_id: string | null;
  segment_id: string | null;
  corrected_text: string | null;
  corrected_meaning: string | null;
};

/** Mirror of REVIEW_CONFIDENCE_THRESHOLD in _shared/recognition.ts. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

const db = supabase as unknown as SupabaseClient;

export async function getReturnByPacketId(packetId: string): Promise<PacketReturn | null> {
  const { data, error } = await db
    .from("packet_returns")
    .select("*")
    .eq("packet_id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PacketReturn) ?? null;
}

/** Returns across a project's packet versions (for the project hub). */
export async function listReturnsForPackets(packetIds: string[]): Promise<PacketReturn[]> {
  if (packetIds.length === 0) return [];
  const { data, error } = await db.from("packet_returns").select("*").in("packet_id", packetIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as PacketReturn[];
}

/** Whether any returned material (readable pages or dictation) exists. */
export async function hasReturnedWork(returnIds: string[]): Promise<boolean> {
  if (returnIds.length === 0) return false;
  const [pages, segments] = await Promise.all([
    db
      .from("page_images")
      .select("id", { count: "exact", head: true })
      .in("return_id", returnIds)
      .eq("status", "recognized"),
    db
      .from("dictation_segments")
      .select("id", { count: "exact", head: true })
      .in("return_id", returnIds),
  ]);
  if (pages.error) throw new Error(pages.error.message);
  if (segments.error) throw new Error(segments.error.message);
  return (pages.count ?? 0) > 0 || (segments.count ?? 0) > 0;
}

/** Open (or reuse) the packet's return. One return per packet. */
export async function ensureReturn(packetId: string): Promise<PacketReturn> {
  const existing = await getReturnByPacketId(packetId);
  if (existing) return existing;
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const { error } = await db
    .from("packet_returns")
    .insert({ packet_id: packetId, user_id: userData.user.id });
  // A concurrent insert losing the unique race is fine — read it back.
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  const row = await getReturnByPacketId(packetId);
  if (!row) throw new Error("Could not open a return for this packet");
  return row;
}

export async function listPageImages(returnId: string): Promise<PageImage[]> {
  const { data, error } = await db
    .from("page_images")
    .select("*")
    .eq("return_id", returnId)
    .order("page_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PageImage[];
}

export async function listRecognizedBlocks(returnId: string): Promise<RecognizedBlock[]> {
  const { data, error } = await db
    .from("recognized_blocks")
    .select("*")
    .eq("return_id", returnId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecognizedBlock[];
}

export async function listDictationSegments(returnId: string): Promise<DictationSegment[]> {
  const { data, error } = await db
    .from("dictation_segments")
    .select("*")
    .eq("return_id", returnId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DictationSegment[];
}

export async function listCorrections(returnId: string): Promise<VerificationCorrection[]> {
  const { data, error } = await db
    .from("verification_corrections")
    .select("*")
    .eq("return_id", returnId);
  if (error) throw new Error(error.message);
  return (data ?? []) as VerificationCorrection[];
}

/** Delete a rejected page so the student can retake it cleanly. */
export async function deletePageImage(page: PageImage): Promise<void> {
  const { error } = await db.from("page_images").delete().eq("id", page.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from("packet-returns").remove([page.storage_path]);
}

/**
 * Upload one photographed page and ask the backend to read it. Free —
 * uploading and reading pages never consume credits.
 */
export async function uploadAndReadPage(
  packetId: string,
  file: File,
): Promise<{
  status: "recognized" | "rejected";
  pageNumber: number | null;
  retakeMessage: string | null;
  blocks: number;
}> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "page.jpg";
  const path = `${userData.user.id}/${packetId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("packet-returns").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data, error } = await supabase.functions.invoke("packet-return", {
    body: { packetId, path },
  });
  if (error) throw new Error(await extractEdgeError(error, "packet-return"));
  return data as {
    status: "recognized" | "rejected";
    pageNumber: number | null;
    retakeMessage: string | null;
    blocks: number;
  };
}

/** Short-lived signed URL for showing the student's own page photo. */
export async function getPageImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("packet-returns").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

/** Segment a dictation transcript and store the segments (user content). */
export async function addDictation(returnId: string, transcript: string): Promise<number> {
  const drafts = segmentDictation(transcript);
  if (drafts.length === 0) return 0;
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const existing = await listDictationSegments(returnId);
  const base = (existing[existing.length - 1]?.position ?? 0) + 1;
  const rows = drafts.map((d, i) => ({
    return_id: returnId,
    user_id: userData.user!.id,
    position: base + i,
    transcript: d.transcript,
    resolved_target: d.target,
  }));
  const { error } = await db.from("dictation_segments").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function deleteDictationSegment(id: string): Promise<void> {
  const { error } = await db.from("dictation_segments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Save the student's correction of a machine-read block or a dictation
 * segment. The original reading is never edited — corrections are their own
 * rows (provenance rule).
 */
export async function saveCorrection(args: {
  returnId: string;
  blockId?: string;
  segmentId?: string;
  correctedText: string;
}): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const key = args.blockId ? { block_id: args.blockId } : { segment_id: args.segmentId };
  const { data: existing, error: readErr } = await db
    .from("verification_corrections")
    .select("id")
    .match(key)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) {
    const { error } = await db
      .from("verification_corrections")
      .update({ corrected_text: args.correctedText, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("verification_corrections").insert({
      return_id: args.returnId,
      user_id: userData.user.id,
      block_id: args.blockId ?? null,
      segment_id: args.segmentId ?? null,
      corrected_text: args.correctedText,
    });
    if (error) throw new Error(error.message);
  }
}

export async function removeCorrection(id: string): Promise<void> {
  const { error } = await db.from("verification_corrections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Approve the reading: collecting → verified (owner-only workflow state). */
export async function verifyReturn(returnId: string): Promise<void> {
  const { error } = await db
    .from("packet_returns")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", returnId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Handwriting profile (Phase 3, minimal): consent-gated, built only from the
// student's own confirmed corrections, deletable at any time.

export type HandwritingProfile = {
  user_id: string;
  profile_text: string;
  consent_at: string;
  updated_at: string;
};

export async function getHandwritingProfile(): Promise<HandwritingProfile | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await db
    .from("handwriting_profiles")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HandwritingProfile) ?? null;
}

/** Explicit consent gate: creates the (empty) profile row. */
export async function enableHandwritingProfile(): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const { error } = await db
    .from("handwriting_profiles")
    .upsert({ user_id: userData.user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Delete the profile: stops adaptation immediately; past work is untouched. */
export async function deleteHandwritingProfile(): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Not signed in");
  const { error } = await db.from("handwriting_profiles").delete().eq("user_id", userData.user.id);
  if (error) throw new Error(error.message);
}

const PROFILE_MAX_CHARS = 4000;

/**
 * Feed confirmed corrections into the consented profile. Called at
 * verification approval; a no-op when the student never opted in.
 */
export async function updateHandwritingProfileFromCorrections(
  corrections: Array<{ original: string; corrected: string }>,
): Promise<void> {
  if (corrections.length === 0) return;
  const profile = await getHandwritingProfile();
  if (!profile) return; // no consent, no adaptation
  const lines = corrections
    .filter((c) => c.original.trim() && c.corrected.trim() && c.original !== c.corrected)
    .map((c) => `- "${c.original.slice(0, 60)}" was actually "${c.corrected.slice(0, 60)}"`);
  if (lines.length === 0) return;
  const next = `${profile.profile_text}\n${lines.join("\n")}`.trim().slice(-PROFILE_MAX_CHARS);
  const { error } = await db
    .from("handwriting_profiles")
    .update({ profile_text: next, updated_at: new Date().toISOString() })
    .eq("user_id", profile.user_id);
  if (error) throw new Error(error.message);
}
