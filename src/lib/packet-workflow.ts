// Client access to the research-packet return/verification/follow-up/artifact
// tables (docs/research-workflow/, contracts in
// docs/research-workflow/BACKEND-CONTRACTS.md).
//
// Write posture: the client holds SELECT-only grants on all of these tables.
// Every write goes through an Edge Function (create-student-return-upload,
// analyze-returned-page, submit-dictation, verify-student-responses,
// prepare-follow-up-questions, run-follow-up-research,
// create-final-document-job, create-presentation-job). This module is reads
// plus pure derivations only.

import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Row types — narrowed views of the generated Supabase types. Status unions
// mirror the CHECK constraints in migration 20260713043040.

export type PacketReturn = {
  id: string;
  packet_id: string;
  user_id: string;
  status: "pending" | "uploading" | "recognizing" | "ready" | "failed";
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PageImage = {
  id: string;
  return_id: string;
  user_id: string;
  storage_path: string;
  page_number: number | null;
  quality: Record<string, unknown>;
  status: "uploaded" | "analyzing" | "analyzed" | "failed";
  created_at: string;
  updated_at: string;
};

export type RecognizedBlock = {
  id: string;
  page_image_id: string;
  user_id: string;
  location: Record<string, unknown>;
  text: string;
  confidence: number;
  annotation_type: "response" | "margin_note" | "underline" | "circle" | "arrow" | "other" | null;
  interpretation_confidence: number | null;
  linked_question_id: string | null;
  linked_anchor: string | null;
  created_at: string;
};

export type DictationSegment = {
  id: string;
  return_id: string | null;
  packet_id: string;
  user_id: string;
  transcript: string;
  resolved_target: { page?: number; questionId?: string; anchor?: string; followup?: number };
  segment_order: number;
  storage_path: string | null;
  created_at: string;
};

export type VerificationCorrection = {
  id: string;
  block_id: string | null;
  segment_id: string | null;
  user_id: string;
  corrected_text: string;
  corrected_meaning: Record<string, unknown> | null;
  verified_at: string;
  created_at: string;
};

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
  updated_at: string;
};

export type FinalArtifact = {
  id: string;
  piece_id: string;
  run_id: string | null;
  user_id: string;
  kind: "docx" | "pptx" | "visual";
  status: "pending" | "generating" | "ready" | "failed";
  storage_path: string | null;
  provenance: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PacketPiece = {
  id: string;
  user_id: string;
  slug: string;
  workflow: "longform" | "research_packet";
  stage: string;
  created_at: string;
};

export type Packet = {
  id: string;
  piece_id: string;
  run_id: string;
  user_id: string;
  version: number;
  supersedes_packet_id: string | null;
  status: "generated" | "reviewed";
  analysis: Record<string, unknown> | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Piece-scoped reads for the project hub.

export async function getPiece(pieceId: string): Promise<PacketPiece | null> {
  const { data, error } = await supabase
    .from("pieces")
    .select("id, user_id, slug, workflow, stage, created_at")
    .eq("id", pieceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PacketPiece) ?? null;
}

export async function listPacketsByPiece(pieceId: string): Promise<Packet[]> {
  const { data, error } = await supabase
    .from("packets")
    .select("*")
    .eq("piece_id", pieceId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Packet[];
}

export async function listRunsByPiece(pieceId: string) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id, kind, status, error, created_at, completed_at")
    .eq("piece_id", pieceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    kind: string;
    status: string;
    error: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
}

/** Returns belong to packets, not pieces — join through the packet ids. */
export async function listReturnsByPackets(packetIds: string[]): Promise<PacketReturn[]> {
  if (packetIds.length === 0) return [];
  const { data, error } = await supabase
    .from("packet_returns")
    .select("*")
    .in("packet_id", packetIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PacketReturn[];
}

export async function listFollowupsByPackets(packetIds: string[]): Promise<FollowupQuestion[]> {
  if (packetIds.length === 0) return [];
  const { data, error } = await supabase
    .from("followup_questions")
    .select("*")
    .in("packet_id", packetIds)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowupQuestion[];
}

export async function listArtifactsByPiece(pieceId: string): Promise<FinalArtifact[]> {
  const { data, error } = await supabase
    .from("final_artifacts")
    .select("*")
    .eq("piece_id", pieceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinalArtifact[];
}

// ---------------------------------------------------------------------------
// Return-scoped reads (return page, review page).

export async function getReturn(returnId: string): Promise<PacketReturn | null> {
  const { data, error } = await supabase
    .from("packet_returns")
    .select("*")
    .eq("id", returnId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PacketReturn) ?? null;
}

export async function listPageImages(returnId: string): Promise<PageImage[]> {
  const { data, error } = await supabase
    .from("page_images")
    .select("*")
    .eq("return_id", returnId)
    .order("page_number", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PageImage[];
}

export async function listRecognizedBlocks(pageImageIds: string[]): Promise<RecognizedBlock[]> {
  if (pageImageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("recognized_blocks")
    .select("*")
    .in("page_image_id", pageImageIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecognizedBlock[];
}

export async function listDictationSegments(returnId: string): Promise<DictationSegment[]> {
  const { data, error } = await supabase
    .from("dictation_segments")
    .select("*")
    .eq("return_id", returnId)
    .order("segment_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DictationSegment[];
}

export async function listCorrections(input: {
  blockIds: string[];
  segmentIds: string[];
}): Promise<VerificationCorrection[]> {
  const { blockIds, segmentIds } = input;
  if (blockIds.length === 0 && segmentIds.length === 0) return [];
  const parts: string[] = [];
  if (blockIds.length > 0) parts.push(`block_id.in.(${blockIds.join(",")})`);
  if (segmentIds.length > 0) parts.push(`segment_id.in.(${segmentIds.join(",")})`);
  const { data, error } = await supabase
    .from("verification_corrections")
    .select("*")
    .or(parts.join(","))
    .order("verified_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VerificationCorrection[];
}

// ---------------------------------------------------------------------------
// Return status as the student experiences it.
//
// The persisted packet_returns.status only tracks the upload lifecycle
// (create-student-return-upload leaves it at 'uploading'); recognition
// progress lives on page_images and the verification verdict lives in
// verification_corrections. This derivation folds those rows into the
// stage vocabulary used by src/lib/packet-stage.ts.

export type ReturnUiStatus = "collecting" | "recognizing" | "needs_review" | "verified" | "failed";

export function deriveReturnUiStatus(input: {
  returnStatus: PacketReturn["status"];
  pages: Array<Pick<PageImage, "status">>;
  segmentCount: number;
  hasVerification: boolean;
}): ReturnUiStatus {
  if (input.hasVerification) return "verified";
  if (input.returnStatus === "failed") return "failed";
  const total = input.pages.length;
  const analyzed = input.pages.filter((p) => p.status === "analyzed").length;
  const failed = input.pages.filter((p) => p.status === "failed").length;
  const inFlight = input.pages.some((p) => p.status === "analyzing");
  if (inFlight) return "recognizing";
  if (total > 0) {
    if (analyzed > 0 && analyzed + failed === total) return "needs_review";
    if (failed === total) return "failed";
    return "collecting";
  }
  // Dictation-only return: reviewable as soon as a segment exists.
  return input.segmentCount > 0 ? "needs_review" : "collecting";
}

export type ReturnSummary = {
  id: string;
  packet_id: string;
  uiStatus: ReturnUiStatus;
  created_at: string;
};

/**
 * One query set for the project hub: every return on the piece's packets with
 * its derived UI status. Corrections are resolved back to their return via
 * the block → page_image → return (or segment → return) foreign keys.
 */
export async function loadReturnSummaries(packetIds: string[]): Promise<ReturnSummary[]> {
  const returns = await listReturnsByPackets(packetIds);
  if (returns.length === 0) return [];
  const returnIds = returns.map((r) => r.id);

  const [{ data: pages, error: pagesErr }, { data: segments, error: segErr }, verifiedReturnIds] =
    await Promise.all([
      supabase.from("page_images").select("return_id, status").in("return_id", returnIds),
      supabase.from("dictation_segments").select("return_id").in("return_id", returnIds),
      listVerifiedReturnIds(),
    ]);
  if (pagesErr) throw new Error(pagesErr.message);
  if (segErr) throw new Error(segErr.message);

  return returns.map((r) => ({
    id: r.id,
    packet_id: r.packet_id,
    created_at: r.created_at,
    uiStatus: deriveReturnUiStatus({
      returnStatus: r.status,
      pages: (pages ?? []).filter((p) => p.return_id === r.id) as Array<Pick<PageImage, "status">>,
      segmentCount: (segments ?? []).filter((s) => s.return_id === r.id).length,
      hasVerification: verifiedReturnIds.has(r.id),
    }),
  }));
}

/** Return ids that have at least one verification correction (RLS-scoped). */
async function listVerifiedReturnIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("verification_corrections")
    .select(
      "id, block:recognized_blocks!block_id(page:page_images!page_image_id(return_id)), segment:dictation_segments!segment_id(return_id)",
    );
  if (error) throw new Error(error.message);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const viaBlock = (row.block as { page?: { return_id?: string } } | null)?.page?.return_id;
    const viaSegment = (row.segment as { return_id?: string | null } | null)?.return_id;
    if (viaBlock) ids.add(viaBlock);
    if (viaSegment) ids.add(viaSegment);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Artifact downloads (free — no credits attach to downloads).

export async function artifactDownloadUrl(artifact: FinalArtifact): Promise<string> {
  if (!artifact.storage_path) throw new Error("Artifact has no file yet");
  const { data, error } = await supabase.storage
    .from("final-artifacts")
    .createSignedUrl(artifact.storage_path, 60 * 10);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not sign URL");
  return data.signedUrl;
}
