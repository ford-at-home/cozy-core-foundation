// Handwriting recognition for returned packet pages (Phase 2 of
// docs/research-workflow/04-return-and-recognition.md). Pure logic module:
// prompt construction, strict response validation, and idempotent
// persistence. The packet-return Edge Function owns I/O.
//
// Principles enforced here:
//   - The quality gate runs INSIDE the same multimodal call: the model must
//     first judge whether the photo is readable and name specific problems
//     (blur, glare, crop, shadow, skew) before reading anything.
//   - Never fabricate unreadable handwriting: unreadable text comes back as
//     low confidence, and anything below the review threshold is flagged
//     for the verification screen — machine readings are never presented as
//     confirmed student writing.
//   - Recognition is free to the student. The provider cost is recorded as
//     an idempotent inference row (lovable:hwr:{returnId}:{imagePath}) by
//     the caller.

// deno-lint-ignore-file no-explicit-any

export const ANNOTATION_TYPES = [
  "response",
  "margin_note",
  "shorthand",
  "underline",
  "circle",
  "strikethrough",
  "arrow",
  "followup_question",
  "other",
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

/** Below this confidence a block is highlighted for explicit review. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

/** Named, user-actionable quality problems the gate may report. */
export const QUALITY_PROBLEMS = [
  "blurred",
  "glare",
  "shadow",
  "cropped",
  "skewed",
  "too_dark",
  "too_small",
  "multiple_pages",
  "not_a_packet_page",
] as const;
export type QualityProblem = (typeof QUALITY_PROBLEMS)[number];

export interface RecognizedBlock {
  position: number;
  location: string | null;
  text: string;
  confidence: number;
  annotation_type: AnnotationType;
  interpretation: string | null;
  interpretation_confidence: number | null;
  /** Question number as printed (Q3 → 3); resolved to an id by the caller. */
  question_number: number | null;
  linked_anchor: string | null;
}

export interface RecognitionOutcome {
  page_number: number | null;
  quality: { ok: boolean; problems: QualityProblem[] };
  blocks: RecognizedBlock[];
}

export interface RecognitionContext {
  /** The packet body markdown as printed (so the model can separate printed text from handwriting). */
  packetBody: string;
  /** Printed questions in order: [{ number, prompt }]. */
  questions: Array<{ number: number; prompt: string }>;
  /** Optional consented per-user handwriting profile (Phase 3). */
  handwritingProfile?: string | null;
}

const PACKET_BODY_PROMPT_CAP = 60_000; // chars of printed body included as context

export function buildRecognitionPrompt(ctx: RecognitionContext): string {
  const questionList = ctx.questions.map((q) => `Q${q.number}: ${q.prompt}`).join("\n");
  const profile = (ctx.handwritingProfile ?? "").trim();
  return `You are reading a photographed page of a printed research packet that a student has worked through by hand. The printed content is known to you (below); everything else on the page is the student's handwriting.

FIRST, judge the photo itself. If it cannot be read reliably, say so and STOP — do not guess at handwriting in a bad photo. Quality problems must come from this exact list: blurred, glare, shadow, cropped, skewed, too_dark, too_small, multiple_pages, not_a_packet_page.

THEN, if the photo is readable, transcribe every handwritten element:
- answers written in the ruled response areas (link them to their printed question number),
- margin notes, underlines, circles, strikethroughs, arrows,
- shorthand marks from the packet's markup legend (S{n}P{m} anchors, symbols, directive tokens),
- follow-up research questions written in the follow-up section.

Rules:
- NEVER invent text you cannot read. If a word is unreadable, transcribe what you can and lower the confidence score. A confidence below 0.7 means "the student must confirm this".
- Keep crossed-out text distinct (annotation_type "strikethrough"), never merged into active text.
- Report the printed page number if visible (bottom of the page).
- Distinguish the student's words (text) from your interpretation of a mark's meaning (interpretation). Never merge them.

Respond with ONLY a JSON object, no markdown fence, in this exact shape:
{
  "page_number": <integer or null>,
  "quality": { "ok": <boolean>, "problems": [<strings from the list above>] },
  "blocks": [
    {
      "position": <integer, top-to-bottom reading order starting at 1>,
      "location": <short string like "response area under Q3" or "left margin beside S4P2" or null>,
      "text": <the handwriting, verbatim>,
      "confidence": <0..1>,
      "annotation_type": <"response"|"margin_note"|"shorthand"|"underline"|"circle"|"strikethrough"|"arrow"|"followup_question"|"other">,
      "interpretation": <what the mark means, or null>,
      "interpretation_confidence": <0..1 or null>,
      "question_number": <the printed question number this answers, or null>,
      "linked_anchor": <"S{n}P{m}" anchor this refers to, or null>
    }
  ]
}
${profile ? `\nThis student's handwriting profile (built from their own confirmed corrections):\n${profile}\n` : ""}
PRINTED QUESTIONS ON THIS PACKET:
${questionList || "(none)"}

PRINTED PACKET BODY (for separating printed text from handwriting):
${ctx.packetBody.slice(0, PACKET_BODY_PROMPT_CAP)}`;
}

function clamp01(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/**
 * Validate the model's response. Throws on a malformed document (the caller
 * treats that as a recognition failure, not a quality rejection). Individual
 * malformed blocks are dropped; readable ones survive.
 */
export function parseRecognitionResult(raw: string): RecognitionOutcome {
  // Models occasionally wrap JSON in a fence despite instructions.
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let doc: any;
  try {
    doc = JSON.parse(unfenced);
  } catch {
    throw new Error("recognition response is not valid JSON");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("recognition response must be a JSON object");
  }
  const qualityOk = doc.quality?.ok === true;
  const problems: QualityProblem[] = Array.isArray(doc.quality?.problems)
    ? doc.quality.problems.filter((p: unknown) =>
        (QUALITY_PROBLEMS as readonly string[]).includes(String(p)),
      )
    : [];
  // An explicit not-ok verdict with no recognizable named problem still
  // fails the gate; surface a generic-but-actionable reason.
  if (!qualityOk && problems.length === 0) problems.push("blurred");

  const pageNumber =
    typeof doc.page_number === "number" && Number.isInteger(doc.page_number) && doc.page_number > 0
      ? doc.page_number
      : null;

  const blocks: RecognizedBlock[] = [];
  if (qualityOk && Array.isArray(doc.blocks)) {
    for (const b of doc.blocks) {
      if (!b || typeof b !== "object") continue;
      if (typeof b.text !== "string" || b.text.trim() === "") continue;
      const confidence = clamp01(b.confidence);
      if (confidence === null) continue;
      blocks.push({
        position: blocks.length + 1,
        location: typeof b.location === "string" && b.location.trim() ? b.location.trim() : null,
        text: b.text.trim(),
        confidence,
        annotation_type: (ANNOTATION_TYPES as readonly string[]).includes(b.annotation_type)
          ? (b.annotation_type as AnnotationType)
          : "other",
        interpretation:
          typeof b.interpretation === "string" && b.interpretation.trim()
            ? b.interpretation.trim()
            : null,
        interpretation_confidence: clamp01(b.interpretation_confidence),
        question_number:
          typeof b.question_number === "number" &&
          Number.isInteger(b.question_number) &&
          b.question_number > 0
            ? b.question_number
            : null,
        linked_anchor:
          typeof b.linked_anchor === "string" && /^S\d+P\d+$/.test(b.linked_anchor.trim())
            ? b.linked_anchor.trim()
            : null,
      });
    }
  }

  return {
    page_number: pageNumber,
    quality: { ok: qualityOk, problems },
    blocks,
  };
}

/** Plain-language retake reasons for each named quality problem. */
export const QUALITY_PROBLEM_MESSAGES: Record<QualityProblem, string> = {
  blurred: "the photo is blurred — hold the camera steady and tap to focus",
  glare: "light is reflecting off the page — tilt the page away from the light",
  shadow: "a shadow is covering part of the page — move somewhere brighter",
  cropped: "part of the page is cut off — fit the whole page in the frame",
  skewed: "the page is at a strong angle — photograph it straight on",
  too_dark: "the photo is too dark — move somewhere brighter",
  too_small: "the writing is too small to read — move the camera closer",
  multiple_pages: "more than one page is in the photo — photograph one page at a time",
  not_a_packet_page:
    "this doesn't look like a packet page — check you photographed the right thing",
};

export function retakeMessage(problems: QualityProblem[]): string {
  const named = problems.map((p) => QUALITY_PROBLEM_MESSAGES[p]).filter(Boolean);
  if (named.length === 0) return "We couldn't read this photo clearly. Please retake it.";
  return `We couldn't read this photo: ${named.join("; ")}. Retake the page, or dictate its answers instead.`;
}

/**
 * Persist one page's recognition outcome. Idempotent and retake-safe:
 * the page row upserts on (return_id, storage_path); blocks belonging to
 * the page are replaced as a set (machine-authored rows — the student's
 * corrections live in verification_corrections and are never touched).
 */
export async function persistPageRecognition(
  admin: any,
  args: {
    returnId: string;
    userId: string;
    storagePath: string;
    outcome: RecognitionOutcome;
    /** position → packet_questions.id map for linking answers to questions. */
    questionIdsByNumber: Map<number, string>;
  },
): Promise<{ pageImageId: string; status: "recognized" | "rejected" }> {
  const status = args.outcome.quality.ok ? "recognized" : "rejected";
  const { data: page, error: pageErr } = await admin
    .from("page_images")
    .upsert(
      {
        return_id: args.returnId,
        user_id: args.userId,
        storage_path: args.storagePath,
        page_number: args.outcome.page_number,
        status,
        quality: args.outcome.quality,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "return_id,storage_path" },
    )
    .select("id")
    .single();
  if (pageErr || !page) {
    throw new Error(`page image upsert failed: ${pageErr?.message ?? "missing row"}`);
  }

  // Replace the machine-read blocks for this page (retake or re-read).
  const { error: delErr } = await admin
    .from("recognized_blocks")
    .delete()
    .eq("page_image_id", page.id);
  if (delErr) throw new Error(`stale block delete failed: ${delErr.message}`);

  if (args.outcome.blocks.length > 0) {
    const rows = args.outcome.blocks.map((b) => ({
      page_image_id: page.id,
      return_id: args.returnId,
      user_id: args.userId,
      position: b.position,
      location: b.location,
      text: b.text,
      confidence: b.confidence,
      annotation_type: b.annotation_type,
      interpretation: b.interpretation,
      interpretation_confidence: b.interpretation_confidence,
      linked_question_id:
        b.question_number !== null
          ? (args.questionIdsByNumber.get(b.question_number) ?? null)
          : null,
      linked_anchor: b.linked_anchor,
    }));
    const { error: blockErr } = await admin
      .from("recognized_blocks")
      .upsert(rows, { onConflict: "page_image_id,position" });
    if (blockErr) throw new Error(`recognized block insert failed: ${blockErr.message}`);
  }

  return { pageImageId: page.id, status };
}
