// Page-image lifecycle helpers shared by analyze-returned-page (the
// interactive path) and reconcile-runs (the sweep path). Without the sweep,
// a crash between "status = analyzing" and the settle leaves the page — and
// therefore the whole return — stuck in a non-terminal state forever.

// deno-lint-ignore-file no-explicit-any
import { logPieceEvent } from "./workflow.ts";

/** A page still 'analyzing' after this long is presumed crashed. */
export const STALE_ANALYZING_MINUTES = 30;

/**
 * Keep packet_returns.status truthful: once no page is still uploaded or
 * analyzing, the return is 'ready' (≥1 readable page) or 'failed'. Settling
 * logs a piece event so the activity history shows when the pages were read.
 */
export async function settleReturnStatus(
  admin: any,
  returnId: string | null,
  ctx?: { pieceId: string | null; userId: string },
): Promise<void> {
  if (!returnId) return;
  const { data: pages } = await admin
    .from("page_images")
    .select("status")
    .eq("return_id", returnId);
  const all = (pages ?? []) as Array<{ status: string }>;
  if (all.length === 0) return;
  const pending = all.some((p) => p.status === "uploaded" || p.status === "analyzing");
  if (pending) return;
  const analyzed = all.filter((p) => p.status === "analyzed").length;
  const status = analyzed > 0 ? "ready" : "failed";
  const { data: updated } = await admin
    .from("packet_returns")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", returnId)
    .neq("status", status)
    .select("id");
  // Log only on the transition (the .neq guard makes re-analysis a no-op).
  if (ctx?.pieceId && (updated ?? []).length > 0) {
    await logPieceEvent(admin, {
      pieceId: ctx.pieceId,
      userId: ctx.userId,
      event: status === "ready" ? "return_read" : "return_read_failed",
      metadata: { returnId, pagesAnalyzed: analyzed, pagesTotal: all.length },
    });
  }
}

/**
 * Fail page_images stuck in 'analyzing' longer than STALE_ANALYZING_MINUTES
 * and settle their returns so the client can offer a retake instead of an
 * eternal spinner. Idempotent: the status guard on the update makes a
 * concurrent settle a no-op. Returns the number of pages swept.
 */
export async function sweepStaleAnalyzingPages(admin: any): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_ANALYZING_MINUTES * 60_000).toISOString();
  const { data: stale } = await admin
    .from("page_images")
    .select("id, return_id")
    .eq("status", "analyzing")
    .lt("updated_at", cutoff);
  const pages = (stale ?? []) as Array<{ id: string; return_id: string | null }>;
  let swept = 0;
  for (const page of pages) {
    const { data: updated } = await admin
      .from("page_images")
      .update({
        status: "failed",
        quality: {
          ok: false,
          issues: [
            {
              code: "other",
              message:
                "Reading this page took too long and was stopped. Retake or re-upload the photo and run the analysis again.",
            },
          ],
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id)
      .eq("status", "analyzing")
      .select("id");
    if ((updated ?? []).length > 0) {
      swept += 1;
      await settleReturnStatus(admin, page.return_id ?? null);
    }
  }
  return swept;
}
