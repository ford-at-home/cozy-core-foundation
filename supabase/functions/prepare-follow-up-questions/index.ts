// prepare-follow-up-questions — the free half of the follow-up stage, in two
// modes on one endpoint so the whole flow stays on one screen:
//
//   Suggest (default): validates 1..3 student questions, optionally asks the
//   AI for a narrower rewording (as a *suggestion* alongside the original,
//   never a silent replacement), and upserts followup_questions rows with
//   status submitted/refined.
//
//   Approve ({ approve: true }): stores the student's final chosen wording as
//   approved_text with status 'approved' — the gate run-follow-up-research
//   requires. Each item carries the original studentText (and the suggestion
//   the student saw, if any) so provenance survives the replacement.
//
// Rows are replaced wholesale per call; once any question on the packet is
// 'researched' the set is frozen (the research already ran against it).
// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { advanceStage, logPieceEvent } from "../_shared/workflow.ts";

const FN = "prepare-follow-up-questions";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_QUESTION_CHARS = 1000;

type ApprovalItem = { studentText: string; approvedText: string; suggestedText: string | null };

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const packetId = typeof body?.packetId === "string" ? body.packetId : "";
    const approve = body?.approve === true;
    if (!packetId)
      return e(FN, 400, "packetId required", { requestId: rid, code: "invalid_input" });

    const clean = (v: unknown) =>
      typeof v === "string" ? v.trim().slice(0, MAX_QUESTION_CHARS) : "";

    let questions: string[] = [];
    let approvals: ApprovalItem[] = [];
    if (approve) {
      approvals = Array.isArray(body?.questions)
        ? body.questions
            .map((q: unknown) => {
              const rec = (q ?? {}) as Record<string, unknown>;
              return {
                studentText: clean(rec.studentText),
                approvedText: clean(rec.approvedText),
                suggestedText: clean(rec.suggestedText) || null,
              };
            })
            .filter((q: ApprovalItem) => q.approvedText.length > 0)
        : [];
      if (approvals.length < 1 || approvals.length > 3) {
        return e(FN, 400, "must approve 1 to 3 questions", {
          requestId: rid,
          code: "invalid_count",
        });
      }
    } else {
      questions = Array.isArray(body?.questions) ? body.questions.map(clean).filter(Boolean) : [];
      if (questions.length < 1 || questions.length > 3) {
        return e(FN, 400, "must submit 1 to 3 questions", {
          requestId: rid,
          code: "invalid_count",
        });
      }
    }
    const wantSuggestions = !approve && body?.suggestRefinements !== false;

    const { data: packet } = await admin
      .from("packets")
      .select("id, user_id, piece_id")
      .eq("id", packetId)
      .maybeSingle();
    if (!packet || packet.user_id !== userId)
      return e(FN, 404, "Packet not found", { requestId: rid, code: "not_found" });

    // The follow-up set is frozen once researched — a second pass would need
    // provenance rules this product doesn't define yet.
    const { count: researched } = await admin
      .from("followup_questions")
      .select("id", { count: "exact", head: true })
      .eq("packet_id", packetId)
      .eq("status", "researched");
    if ((researched ?? 0) > 0) {
      return e(FN, 409, "follow-up research already ran for this packet", {
        requestId: rid,
        code: "already_researched",
      });
    }
    // ...and while a research run is in flight, changing the set would let the
    // completion path stamp 'researched' onto wording the run never saw.
    const { data: activeRun } = await admin
      .from("agent_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "followup_research")
      .contains("input", { packetId })
      .not("status", "in", "(completed,failed,cancelled)")
      .limit(1)
      .maybeSingle();
    if (activeRun) {
      return e(FN, 409, "follow-up research is already running for this packet", {
        requestId: rid,
        code: "research_running",
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const suggestions: (string | null)[] = new Array(questions.length).fill(null);
    if (wantSuggestions && LOVABLE_API_KEY) {
      try {
        const res = await fetch(GATEWAY, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "user",
                content: `Rewrite each of these ${questions.length} follow-up research questions to be narrower and more researchable, keeping the student's intent. Return STRICT JSON: {"refinements":[string,...]}. Do NOT change intent; if a question is already good, echo it back.\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
              },
            ],
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
              if (typeof r === "string" && r.trim() && r.trim() !== questions[i])
                suggestions[i] = r.trim();
            }
          }
        }
      } catch {
        /* suggestions optional */
      }
    }

    // Replace the packet's rows in positions 1..N with this call's set.
    const rows = approve
      ? approvals.map((q, i) => ({
          packet_id: packetId,
          user_id: userId,
          position: i + 1,
          student_text: q.studentText || q.approvedText,
          suggested_text: q.suggestedText,
          approved_text: q.approvedText,
          status: "approved",
        }))
      : questions.map((q, i) => ({
          packet_id: packetId,
          user_id: userId,
          position: i + 1,
          student_text: q,
          suggested_text: suggestions[i],
          status: suggestions[i] ? "refined" : "submitted",
        }));
    // Never delete researched rows — their provenance is the record of what
    // the research pass actually answered (also narrows the check-then-act
    // window against a completing run).
    await admin
      .from("followup_questions")
      .delete()
      .eq("packet_id", packetId)
      .neq("status", "researched");
    const { error: insErr } = await admin.from("followup_questions").insert(rows);
    if (insErr)
      return e(FN, 500, "Failed to store questions", {
        requestId: rid,
        code: "insert_failed",
        cause: insErr,
      });

    await advanceStage(admin, { pieceId: packet.piece_id, to: "follow_up_questions_ready" });
    await logPieceEvent(admin, {
      pieceId: packet.piece_id,
      userId,
      event: approve ? "followups_approved" : "followups_prepared",
      metadata: { count: rows.length },
    });
    return j(
      { count: rows.length, approved: approve, hasSuggestions: suggestions.some(Boolean) },
      201,
      rid,
    );
  }),
);
