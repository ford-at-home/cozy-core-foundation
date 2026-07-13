// prepare-follow-up-questions — validates 1..3 student questions, optionally
// asks the AI for a narrower rewording (as a *suggestion* alongside the
// original, never a silent replacement), and upserts followup_questions rows.
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";

const FN = "prepare-follow-up-questions";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(serve(FN, async (req, rid) => {
  const { userId, admin } = await authenticate(req);
  const body = await req.json().catch(() => ({}));
  const packetId = typeof body?.packetId === "string" ? body.packetId : "";
  const questions: string[] = Array.isArray(body?.questions)
    ? body.questions.map((q: unknown) => typeof q === "string" ? q.trim() : "").filter(Boolean)
    : [];
  const wantSuggestions = body?.suggestRefinements !== false;
  if (!packetId) return e(FN, 400, "packetId required", { requestId: rid, code: "invalid_input" });
  if (questions.length < 1 || questions.length > 3) {
    return e(FN, 400, "must submit 1 to 3 questions", { requestId: rid, code: "invalid_count" });
  }

  const { data: packet } = await admin
    .from("packets").select("id, user_id, piece_id").eq("id", packetId).maybeSingle();
  if (!packet || packet.user_id !== userId) return e(FN, 404, "Packet not found", { requestId: rid, code: "not_found" });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const suggestions: (string | null)[] = new Array(questions.length).fill(null);
  if (wantSuggestions && LOVABLE_API_KEY) {
    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content:
            `Rewrite each of these ${questions.length} follow-up research questions to be narrower and more researchable, keeping the student's intent. Return STRICT JSON: {"refinements":[string,...]}. Do NOT change intent; if a question is already good, echo it back.\n\n${questions.map((q,i)=>`${i+1}. ${q}`).join("\n")}` }],
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const j0 = await res.json();
        const raw = j0?.choices?.[0]?.message?.content ?? "{}";
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed?.refinements)) {
          for (let i = 0; i < questions.length; i++) {
            const r = parsed.refinements[i];
            if (typeof r === "string" && r.trim() && r.trim() !== questions[i]) suggestions[i] = r.trim();
          }
        }
      }
    } catch { /* suggestions optional */ }
  }

  // Upsert positions 1..N. Replace any existing rows for this packet in the same slots.
  await admin.from("followup_questions").delete().eq("packet_id", packetId).gte("position", 1);
  const rows = questions.map((q, i) => ({
    packet_id: packetId, user_id: userId, position: i + 1,
    student_text: q, suggested_text: suggestions[i], status: suggestions[i] ? "refined" : "submitted",
  }));
  const { error: insErr } = await admin.from("followup_questions").insert(rows);
  if (insErr) return e(FN, 500, "Failed to store questions", { requestId: rid, code: "insert_failed", cause: insErr });

  await advanceStage(admin, { pieceId: packet.piece_id, to: "follow_up_questions_ready" });
  await logPieceEvent(admin, { pieceId: packet.piece_id, userId, event: "followups_prepared", metadata: { count: questions.length } });
  return j({ count: rows.length, hasSuggestions: suggestions.some(Boolean) }, 201, rid);
}));
