// submit-dictation — stores a dictation segment for a packet page or question.
// Transcription happens client-side via /api/transcribe; this just persists
// the transcript and optional audio path. JWT + ownership checked.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logPieceEvent } from "../_shared/workflow.ts";

const FN = "submit-dictation";

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const packetId = typeof body?.packetId === "string" ? body.packetId : "";
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    const returnId = typeof body?.returnId === "string" ? body.returnId : null;
    const resolvedTarget = body?.resolvedTarget ?? {};
    const segmentOrder = typeof body?.segmentOrder === "number" ? body.segmentOrder : 0;
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : null;
    if (!packetId || !transcript)
      return e(FN, 400, "packetId and transcript required", {
        requestId: rid,
        code: "invalid_input",
      });
    if (transcript.length > 20000)
      return e(FN, 400, "transcript too long", { requestId: rid, code: "too_long" });

    const { data: packet } = await admin
      .from("packets")
      .select("id, user_id, piece_id")
      .eq("id", packetId)
      .maybeSingle();
    if (!packet || packet.user_id !== userId)
      return e(FN, 404, "Packet not found", { requestId: rid, code: "not_found" });

    const { data: seg, error: err } = await admin
      .from("dictation_segments")
      .insert({
        return_id: returnId,
        packet_id: packetId,
        user_id: userId,
        transcript,
        resolved_target: resolvedTarget,
        segment_order: segmentOrder,
        storage_path: storagePath,
      })
      .select("id")
      .single();
    if (err)
      return e(FN, 500, "Failed to store dictation", {
        requestId: rid,
        code: "insert_failed",
        cause: err,
      });
    await logPieceEvent(admin, {
      pieceId: packet.piece_id,
      userId,
      actor: "student",
      event: "dictation_submitted",
      metadata: { segmentId: seg.id, returnId },
    });
    return j({ segmentId: seg.id }, 201, rid);
  }),
);
