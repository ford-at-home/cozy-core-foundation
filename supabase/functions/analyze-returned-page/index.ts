// analyze-returned-page — reads a page image via signed URL, calls the
// Lovable AI Gateway (Gemini multimodal) for handwriting extraction, and
// writes recognized_blocks. Not billable. JWT + ownership checked.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logEvent } from "../_shared/observability.ts";
import { advanceStage } from "../_shared/workflow.ts";

const FN = "analyze-returned-page";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(serve(FN, async (req, rid) => {
  const { userId, admin } = await authenticate(req);
  const body = await req.json().catch(() => ({}));
  const pageImageId = typeof body?.pageImageId === "string" ? body.pageImageId : "";
  if (!pageImageId) return e(FN, 400, "pageImageId required", { requestId: rid, code: "invalid_input" });

  const { data: page } = await admin
    .from("page_images")
    .select("id, user_id, return_id, storage_path, page_number, status, packet_returns:return_id(packet_id, packets:packet_id(piece_id))")
    .eq("id", pageImageId).maybeSingle();
  if (!page || page.user_id !== userId) {
    return e(FN, 404, "Page not found", { requestId: rid, code: "not_found" });
  }
  if (page.status === "analyzed") {
    return j({ pageImageId, blocks: [], idempotent: true }, 200, rid);
  }

  const { data: signed } = await admin.storage
    .from("packet-returns").createSignedUrl(page.storage_path, 300);
  if (!signed?.signedUrl) return e(FN, 500, "Failed to sign read URL", { requestId: rid, code: "sign_failed" });

  await admin.from("page_images").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", pageImageId);

  // Advance FSM into recognition_running before the AI call so the intermediate
  // stage is observable; responses_need_review is set after blocks are stored.
  const pieceIdEarly = (page as any).packet_returns?.packets?.piece_id;
  if (pieceIdEarly) await advanceStage(admin, { pieceId: pieceIdEarly, to: "recognition_running" });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return e(FN, 500, "LOVABLE_API_KEY missing", { requestId: rid, code: "env_missing" });

  const prompt = `You are extracting a student's handwritten responses from a photographed research packet page.
Return STRICT JSON: {"blocks":[{"text":string,"confidence":number,"annotation_type":"response"|"margin_note"|"underline"|"circle"|"arrow"|"other","location":{"description":string}}]}.
Never invent text; if unreadable, omit the block. Prefer complete words even at lower confidence over guessed characters.`;

  let aiResult: any = null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: signed.signedUrl } },
        ]}],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`gateway ${res.status}: ${t.slice(0, 200)}`);
    }
    const j0 = await res.json();
    const raw = j0?.choices?.[0]?.message?.content ?? "{}";
    aiResult = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    await admin.from("page_images").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pageImageId);
    logEvent(FN, "error", { requestId: rid, message: (err as Error).message });
    return e(FN, 502, "Recognition failed", { requestId: rid, code: "recognition_failed", cause: err });
  }

  const blocks = Array.isArray(aiResult?.blocks) ? aiResult.blocks : [];
  const rows = blocks.slice(0, 100).map((b: any) => ({
    page_image_id: pageImageId,
    user_id: userId,
    text: typeof b?.text === "string" ? b.text : "",
    confidence: typeof b?.confidence === "number" ? Math.max(0, Math.min(1, b.confidence)) : 0,
    annotation_type: ["response","margin_note","underline","circle","arrow","other"].includes(b?.annotation_type) ? b.annotation_type : "other",
    location: b?.location ?? {},
  })).filter((r: any) => r.text.trim().length > 0);
  if (rows.length > 0) await admin.from("recognized_blocks").insert(rows);
  await admin.from("page_images").update({ status: "analyzed", updated_at: new Date().toISOString() }).eq("id", pageImageId);

  if (pieceIdEarly) await advanceStage(admin, { pieceId: pieceIdEarly, to: "responses_need_review" });

  return j({ pageImageId, blocksInserted: rows.length }, 200, rid);
}));
