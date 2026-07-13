// create-student-return-upload — creates a packet_returns row and returns
// signed upload URLs for one or more page images. JWT-authenticated;
// ownership of the packet is verified explicitly.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logEvent } from "../_shared/observability.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";

const FN = "create-student-return-upload";
const MAX_PAGES = 20;

Deno.serve(serve(FN, async (req, rid) => {
  const { userId, admin } = await authenticate(req);
  const body = await req.json().catch(() => ({}));
  const packetId = typeof body?.packetId === "string" ? body.packetId : "";
  const pages: Array<{ pageNumber?: number; contentType?: string }> = Array.isArray(body?.pages) ? body.pages : [];
  if (!packetId || pages.length === 0) {
    return e(FN, 400, "packetId and pages[] required", { requestId: rid, code: "invalid_input" });
  }
  if (pages.length > MAX_PAGES) {
    return e(FN, 400, `too many pages (max ${MAX_PAGES})`, { requestId: rid, code: "too_many_pages" });
  }
  const { data: packet } = await admin
    .from("packets").select("id, piece_id, user_id").eq("id", packetId).maybeSingle();
  if (!packet || packet.user_id !== userId) {
    return e(FN, 404, "Packet not found", { requestId: rid, code: "packet_not_found" });
  }
  const { data: ret, error: retErr } = await admin
    .from("packet_returns")
    .insert({ packet_id: packetId, user_id: userId, status: "uploading" })
    .select("id").single();
  if (retErr) return e(FN, 500, "Failed to create return", { requestId: rid, code: "insert_failed", cause: retErr });

  const uploads: Array<{ pageNumber: number; storagePath: string; signedUrl: string; token: string }> = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNumber = typeof pages[i].pageNumber === "number" ? pages[i].pageNumber : i + 1;
    const path = `${userId}/${ret.id}/page-${pageNumber}.jpg`;
    const { data: signed, error: signErr } = await admin.storage
      .from("packet-returns").createSignedUploadUrl(path);
    if (signErr || !signed) {
      return e(FN, 500, "Failed to sign upload URL", { requestId: rid, code: "sign_failed", cause: signErr });
    }
    await admin.from("page_images").insert({
      return_id: ret.id, user_id: userId, storage_path: path, page_number: pageNumber, status: "uploaded",
    });
    uploads.push({ pageNumber, storagePath: path, signedUrl: signed.signedUrl, token: signed.token });
  }

  // FSM requires packet_ready -> awaiting_student_return -> student_return_received.
  // Both hops are attempted; advanceStage no-ops if the packet is already past a stage.
  await advanceStage(admin, { pieceId: packet.piece_id, to: "awaiting_student_return" });
  await advanceStage(admin, { pieceId: packet.piece_id, to: "student_return_received" });
  await logPieceEvent(admin, { pieceId: packet.piece_id, userId, event: "pages_uploaded", metadata: { returnId: ret.id, pageCount: pages.length } });
  logEvent(FN, "info", { requestId: rid, returnId: ret.id, pageCount: pages.length });
  return j({ returnId: ret.id, uploads }, 201, rid);
}));
