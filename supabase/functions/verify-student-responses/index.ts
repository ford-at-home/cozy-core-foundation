// verify-student-responses — writes verification_corrections rows the student
// approved after reviewing recognition output. Keeps corrections distinct
// from raw recognition; sets the piece stage to responses_verified.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";

const FN = "verify-student-responses";

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const pieceId = typeof body?.pieceId === "string" ? body.pieceId : "";
    const corrections: Array<any> = Array.isArray(body?.corrections) ? body.corrections : [];
    if (!pieceId || corrections.length === 0)
      return e(FN, 400, "pieceId and corrections[] required", {
        requestId: rid,
        code: "invalid_input",
      });
    if (corrections.length > 500)
      return e(FN, 400, "too many corrections", { requestId: rid, code: "too_many" });

    const { data: piece } = await admin
      .from("pieces")
      .select("id, user_id")
      .eq("id", pieceId)
      .maybeSingle();
    if (!piece || piece.user_id !== userId)
      return e(FN, 404, "Piece not found", { requestId: rid, code: "not_found" });

    const rows = corrections
      .filter(
        (c) =>
          (typeof c?.blockId === "string" || typeof c?.segmentId === "string") &&
          typeof c?.correctedText === "string",
      )
      .map((c) => ({
        block_id: c.blockId ?? null,
        segment_id: c.segmentId ?? null,
        user_id: userId,
        corrected_text: c.correctedText,
        corrected_meaning: c.correctedMeaning ?? null,
        verified_by: userId,
      }));
    if (rows.length === 0)
      return e(FN, 400, "no valid corrections", { requestId: rid, code: "invalid_input" });

    const { error: insErr } = await admin.from("verification_corrections").insert(rows);
    if (insErr)
      return e(FN, 500, "Failed to store corrections", {
        requestId: rid,
        code: "insert_failed",
        cause: insErr,
      });

    await advanceStage(admin, { pieceId, to: "responses_verified" });
    await logPieceEvent(admin, {
      pieceId,
      userId,
      event: "verification_completed",
      metadata: { count: rows.length },
    });
    return j({ inserted: rows.length }, 201, rid);
  }),
);
