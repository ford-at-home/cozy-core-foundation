// Client access to final artifacts (Phases 6–7): the final paper (.docx)
// and the class presentation (.pptx). Rows are written only by the
// final-artifacts Edge Function; the client reads its own rows and downloads
// through short-lived signed URLs. Generation costs credits; downloads and
// re-downloads are free.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/edge-error";

export type ArtifactKind = "document" | "presentation";

export type FinalArtifact = {
  id: string;
  piece_id: string;
  packet_id: string | null;
  run_id: string;
  user_id: string;
  kind: ArtifactKind;
  title: string | null;
  storage_path: string;
  created_at: string;
};

export const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  document: "Final paper",
  presentation: "Class presentation",
};

const db = supabase as unknown as SupabaseClient;

export async function listFinalArtifacts(pieceId: string): Promise<FinalArtifact[]> {
  const { data, error } = await db
    .from("final_artifacts")
    .select("id, piece_id, packet_id, run_id, user_id, kind, title, storage_path, created_at")
    .eq("piece_id", pieceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinalArtifact[];
}

/**
 * Generate a final artifact (1 credit). Synchronous on the server: resolves
 * when the file exists or throws with a human-readable error. `requestId`
 * makes a retried submission idempotent.
 */
export async function generateFinalArtifact(
  pieceId: string,
  kind: ArtifactKind,
  requestId: string,
): Promise<{ runId: string; artifactId?: string; title?: string }> {
  const { data, error } = await supabase.functions.invoke("final-artifacts", {
    body: { pieceId, kind, requestId },
  });
  if (error) throw new Error(await extractEdgeError(error, "final-artifacts"));
  return data as { runId: string; artifactId?: string; title?: string };
}

/** Short-lived signed download URL for the student's own file. Free. */
export async function getArtifactDownloadUrl(artifact: FinalArtifact): Promise<string> {
  const filename =
    artifact.kind === "document"
      ? `${artifact.title ?? "final-paper"}.docx`
      : `${artifact.title ?? "presentation"}.pptx`;
  const { data, error } = await supabase.storage
    .from("final-artifacts")
    .createSignedUrl(artifact.storage_path, 60 * 10, { download: filename });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create a download link");
  }
  return data.signedUrl;
}
