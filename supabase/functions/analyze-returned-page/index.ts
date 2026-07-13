// analyze-returned-page — reads a page image via signed URL, calls the
// Lovable AI Gateway (Gemini multimodal) for handwriting extraction, and
// writes recognized_blocks. Not billable to the student, but every gateway
// call records an idempotent inference row (lovable:hwr:{returnId}:{path})
// against the packet's generation run. JWT + ownership checked.
//
// The prompt carries the packet's question list so responses come back
// linked to the question they answer (recognized_blocks.linked_question_id),
// and a quality gate rejects unreadable photos with specific retake reasons
// instead of fabricated text (_shared/recognition.ts).
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logEvent } from "../_shared/observability.ts";
import { advanceStage } from "../_shared/workflow.ts";
import { settleReturnStatus } from "../_shared/pages.ts";
import { recordInference } from "../_shared/usage.ts";
import {
  blocksToRows,
  buildRecognitionPrompt,
  parseRecognitionResult,
  type RecognitionQuestionContext,
} from "../_shared/recognition.ts";

const FN = "analyze-returned-page";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const pageImageId = typeof body?.pageImageId === "string" ? body.pageImageId : "";
    if (!pageImageId)
      return e(FN, 400, "pageImageId required", { requestId: rid, code: "invalid_input" });

    const { data: page } = await admin
      .from("page_images")
      .select(
        "id, user_id, return_id, storage_path, page_number, status, packet_returns:return_id(id, packet_id, packets:packet_id(id, run_id, piece_id))",
      )
      .eq("id", pageImageId)
      .maybeSingle();
    if (!page || page.user_id !== userId) {
      return e(FN, 404, "Page not found", { requestId: rid, code: "not_found" });
    }
    if (page.status === "analyzed") {
      return j({ pageImageId, blocksInserted: 0, idempotent: true }, 200, rid);
    }
    const ret = (page as any).packet_returns as {
      id: string;
      packet_id: string;
      packets: { id: string; run_id: string; piece_id: string } | null;
    } | null;
    const packet = ret?.packets ?? null;

    // Everything that can fail without provider involvement is checked BEFORE
    // the page is flipped to 'analyzing', so no early return can strand it.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      return e(FN, 500, "LOVABLE_API_KEY missing", { requestId: rid, code: "env_missing" });

    const { data: signed } = await admin.storage
      .from("packet-returns")
      .createSignedUrl(page.storage_path, 300);
    if (!signed?.signedUrl)
      return e(FN, 500, "Failed to sign read URL", { requestId: rid, code: "sign_failed" });

    await admin
      .from("page_images")
      .update({ status: "analyzing", updated_at: new Date().toISOString() })
      .eq("id", pageImageId);
    if (ret) {
      await admin
        .from("packet_returns")
        .update({ status: "recognizing", updated_at: new Date().toISOString() })
        .eq("id", ret.id)
        .in("status", ["pending", "uploading"]);
    }

    // Advance FSM into recognition_running before the AI call so the
    // intermediate stage is observable; responses_need_review is set after
    // blocks are stored. Both no-op (with a logged warning) for pieces whose
    // early FSM stages were never advanced.
    if (packet?.piece_id) {
      await advanceStage(admin, { pieceId: packet.piece_id, to: "recognition_running" });
    }

    // Question context so responses come back linked to their question.
    let questions: RecognitionQuestionContext[] = [];
    if (ret?.packet_id) {
      const { data: qs } = await admin
        .from("packet_questions")
        .select("id, position, prompt")
        .eq("packet_id", ret.packet_id)
        .order("position", { ascending: true });
      questions = (qs ?? []) as RecognitionQuestionContext[];
    }

    const startedAt = new Date().toISOString();
    let recognition: ReturnType<typeof parseRecognitionResult>;
    let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: buildRecognitionPrompt(questions) },
                { type: "image_url", image_url: { url: signed.signedUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`gateway ${res.status}: ${t.slice(0, 200)}`);
      }
      const j0 = await res.json();
      usage = j0?.usage ?? null;
      const raw = j0?.choices?.[0]?.message?.content ?? "{}";
      recognition = parseRecognitionResult(typeof raw === "string" ? raw : JSON.stringify(raw));
    } catch (err) {
      await admin
        .from("page_images")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pageImageId);
      await settleReturnStatus(admin, ret?.id ?? null, {
        pieceId: packet?.piece_id ?? null,
        userId,
      });
      logEvent(FN, "error", { requestId: rid, message: (err as Error).message });
      return e(FN, 502, "Recognition failed", {
        requestId: rid,
        code: "recognition_failed",
        cause: err,
      });
    }

    // Cost accounting: recognition is free to the student but the gateway
    // call is a real inference; record it idempotently against the packet's
    // generation run (spec key: lovable:hwr:{returnId}:{imagePath}).
    if (packet?.run_id && ret) {
      try {
        await recordInference(admin, {
          runId: packet.run_id,
          provider: "lovable",
          model: MODEL,
          operationType: "llm",
          idempotencyKey: `lovable:hwr:${ret.id}:${page.storage_path}`,
          startedAt,
          completedAt: new Date().toISOString(),
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          metadata: { pageImageId, returnId: ret.id, kind: "handwriting_recognition" },
        });
      } catch (err) {
        // Never fail the user-facing request over cost bookkeeping.
        logEvent(FN, "warn", {
          requestId: rid,
          event: "record_inference_failed",
          message: (err as Error).message,
        });
      }
    }

    // Quality gate: an unreadable photo produces named retake reasons, no
    // fabricated blocks. The page is marked failed so the client offers a
    // retake; nothing about the return is lost.
    if (!recognition.quality.ok) {
      await admin
        .from("page_images")
        .update({
          status: "failed",
          quality: recognition.quality,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageImageId);
      await settleReturnStatus(admin, ret?.id ?? null, {
        pieceId: packet?.piece_id ?? null,
        userId,
      });
      return j({ pageImageId, blocksInserted: 0, quality: recognition.quality }, 200, rid);
    }

    const rows = blocksToRows(recognition.blocks, { pageImageId, userId, questions });
    if (rows.length > 0) {
      // Re-analysis after a transient failure: replace this page's blocks so
      // repeated calls never duplicate them.
      await admin.from("recognized_blocks").delete().eq("page_image_id", pageImageId);
      await admin.from("recognized_blocks").insert(rows);
    }
    await admin
      .from("page_images")
      .update({
        status: "analyzed",
        quality: recognition.quality,
        ...(page.page_number == null && recognition.page_number !== null
          ? { page_number: recognition.page_number }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pageImageId);
    await settleReturnStatus(admin, ret?.id ?? null, { pieceId: packet?.piece_id ?? null, userId });

    if (packet?.piece_id) {
      await advanceStage(admin, { pieceId: packet.piece_id, to: "responses_need_review" });
    }

    return j({ pageImageId, blocksInserted: rows.length, quality: recognition.quality }, 200, rid);
  }),
);
