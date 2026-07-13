// create-student-return-upload — creates (or appends to) a packet_returns row
// and returns signed upload URLs for one or more page images. JWT-
// authenticated; ownership of the packet (and return, when appending) is
// verified explicitly.
//
// Append mode (returnId provided) powers the retake loop: a failed page with
// the same pageNumber is replaced (row + storage object) instead of piling
// up, and the return drops back to 'uploading' so recognition can rerun.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logEvent } from "../_shared/observability.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";

const FN = "create-student-return-upload";
const MAX_PAGES = 20;

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const packetId = typeof body?.packetId === "string" ? body.packetId : "";
    const existingReturnId = typeof body?.returnId === "string" ? body.returnId : null;
    const pages: Array<{ pageNumber?: number; contentType?: string }> = Array.isArray(body?.pages)
      ? body.pages
      : [];
    // pages may be empty: a dictation-only return still needs its
    // packet_returns row so segments and the review step have a home.
    if (!packetId) {
      return e(FN, 400, "packetId required", { requestId: rid, code: "invalid_input" });
    }
    if (pages.length > MAX_PAGES) {
      return e(FN, 400, `too many pages (max ${MAX_PAGES})`, {
        requestId: rid,
        code: "too_many_pages",
      });
    }
    const { data: packet } = await admin
      .from("packets")
      .select("id, piece_id, user_id")
      .eq("id", packetId)
      .maybeSingle();
    if (!packet || packet.user_id !== userId) {
      return e(FN, 404, "Packet not found", { requestId: rid, code: "packet_not_found" });
    }

    let returnId: string;
    if (existingReturnId) {
      const { data: ret } = await admin
        .from("packet_returns")
        .select("id, user_id, packet_id")
        .eq("id", existingReturnId)
        .maybeSingle();
      if (!ret || ret.user_id !== userId || ret.packet_id !== packetId) {
        return e(FN, 404, "Return not found", { requestId: rid, code: "not_found" });
      }
      returnId = ret.id;
      await admin
        .from("packet_returns")
        .update({ status: "uploading", updated_at: new Date().toISOString() })
        .eq("id", returnId);
    } else {
      const { data: ret, error: retErr } = await admin
        .from("packet_returns")
        .insert({ packet_id: packetId, user_id: userId, status: "uploading" })
        .select("id")
        .single();
      if (retErr)
        return e(FN, 500, "Failed to create return", {
          requestId: rid,
          code: "insert_failed",
          cause: retErr,
        });
      returnId = ret.id;
    }

    // Retake handling: a re-upload of a failed page replaces it.
    const { data: existingPages } = await admin
      .from("page_images")
      .select("id, page_number, status, storage_path")
      .eq("return_id", returnId);
    const failedByNumber = new Map<number, { id: string; storage_path: string }>();
    let maxNumber = 0;
    for (const p of existingPages ?? []) {
      if (typeof p.page_number === "number") maxNumber = Math.max(maxNumber, p.page_number);
      if (p.status === "failed" && typeof p.page_number === "number") {
        failedByNumber.set(p.page_number, { id: p.id, storage_path: p.storage_path });
      }
    }

    const uploads: Array<{
      pageNumber: number;
      storagePath: string;
      signedUrl: string;
      token: string;
    }> = [];
    for (let i = 0; i < pages.length; i++) {
      const pageNumber =
        typeof pages[i].pageNumber === "number" ? (pages[i].pageNumber as number) : ++maxNumber;
      const prior = failedByNumber.get(pageNumber);
      if (prior) {
        await admin.from("page_images").delete().eq("id", prior.id);
        await admin.storage.from("packet-returns").remove([prior.storage_path]);
        failedByNumber.delete(pageNumber);
      }
      // Unique path per upload so a retake never collides with the object
      // it replaces (folder prefix = auth.uid() per storage RLS).
      const path = `${userId}/${returnId}/page-${pageNumber}-${Date.now()}-${i}.jpg`;
      const { data: signed, error: signErr } = await admin.storage
        .from("packet-returns")
        .createSignedUploadUrl(path);
      if (signErr || !signed) {
        return e(FN, 500, "Failed to sign upload URL", {
          requestId: rid,
          code: "sign_failed",
          cause: signErr,
        });
      }
      await admin.from("page_images").insert({
        return_id: returnId,
        user_id: userId,
        storage_path: path,
        page_number: pageNumber,
        status: "uploaded",
      });
      uploads.push({
        pageNumber,
        storagePath: path,
        signedUrl: signed.signedUrl,
        token: signed.token,
      });
    }

    // FSM requires packet_ready -> awaiting_student_return -> student_return_received.
    // Both hops are attempted; advanceStage no-ops if the packet is already past a stage.
    await advanceStage(admin, { pieceId: packet.piece_id, to: "awaiting_student_return" });
    await advanceStage(admin, { pieceId: packet.piece_id, to: "student_return_received" });
    await logPieceEvent(admin, {
      pieceId: packet.piece_id,
      userId,
      event: "pages_uploaded",
      metadata: { returnId, pageCount: pages.length, appended: existingReturnId !== null },
    });
    logEvent(FN, "info", { requestId: rid, returnId, pageCount: pages.length });
    return j({ returnId, uploads }, 201, rid);
  }),
);
