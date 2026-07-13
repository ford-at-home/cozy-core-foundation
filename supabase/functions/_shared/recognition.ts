// Handwriting-recognition prompt + response validation for
// analyze-returned-page (docs/research-workflow/04-return-and-recognition.md).
//
// The prompt carries the packet's own question list so the model can link a
// handwritten response to the question it answers (retained as
// recognized_blocks.linked_question_id) and separate printed packet text
// from student handwriting. The parser enforces the no-fabrication rule:
// blocks without recognized text are dropped, confidence is clamped to
// [0, 1], and a page-level quality verdict travels with the blocks so an
// unreadable photo produces a specific retake reason instead of guesses.

export interface RecognitionQuestionContext {
  id: string;
  position: number;
  prompt: string;
}

export const ANNOTATION_TYPES = [
  "response",
  "margin_note",
  "underline",
  "circle",
  "arrow",
  "other",
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const QUALITY_CODES = [
  "blur",
  "glare",
  "shadow",
  "cropped",
  "skew",
  "low_contrast",
  "too_small",
  "multiple_pages",
  "not_a_packet_page",
  "other",
] as const;

export type QualityIssue = { code: string; message: string };

export interface RecognizedBlockDraft {
  text: string;
  confidence: number;
  annotation_type: AnnotationType;
  location: { description: string };
  question_position: number | null;
  anchor: string | null;
  interpretation_confidence: number | null;
}

export interface PageRecognition {
  quality: { ok: boolean; issues: QualityIssue[] };
  page_number: number | null;
  blocks: RecognizedBlockDraft[];
}

/** Blocks below this confidence require an explicit verdict at review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

const MAX_BLOCKS_PER_PAGE = 100;

export function buildRecognitionPrompt(questions: RecognitionQuestionContext[]): string {
  const questionList =
    questions.length > 0
      ? questions.map((q) => `Q${q.position} (id ${q.id}): ${q.prompt}`).join("\n")
      : "(no questions available for this packet)";
  return `You are reading a photographed page of a printed research packet that a student completed by hand.

The printed packet contains these questions (printed text — do NOT transcribe it as handwriting):
<<<QUESTIONS
${questionList}
QUESTIONS>>>

Extract ONLY the student's handwriting and annotation marks. Rules — all mandatory:
- NEVER invent, guess, or autocomplete text. If a word is unreadable, omit it; if a whole block is unreadable, omit the block. Prefer complete words at lower confidence over guessed characters.
- Separate printed packet text from handwriting. Printed text is context, not output.
- When a handwritten response sits in or near a question's ruled answer space, set "question_position" to that question's number. Otherwise null.
- If the handwriting references a printed block anchor (like "S2P4"), set "anchor" to it. Otherwise null.
- Classify each block: "response" (an answer in a writing space), "margin_note", "underline", "circle", "arrow", or "other".
- "confidence" (0..1) is transcription confidence; "interpretation_confidence" (0..1 or null) is how sure you are about the annotation's meaning/classification.
- Assess photo quality first. If the page cannot be read reliably (blur, glare, shadow, cropped edges, heavy skew, low contrast, writing too small, several pages in one photo), set quality.ok=false and name each problem with a specific, actionable message (e.g. "The bottom third is cut off — retake with the whole page in frame."). Codes: blur, glare, shadow, cropped, skew, low_contrast, too_small, multiple_pages, not_a_packet_page, other.
- If a printed page number is visible, report it as "page_number".

Return STRICT JSON, nothing else:
{"quality":{"ok":boolean,"issues":[{"code":string,"message":string}]},"page_number":number|null,"blocks":[{"text":string,"confidence":number,"annotation_type":string,"location":{"description":string},"question_position":number|null,"anchor":string|null,"interpretation_confidence":number|null}]}`;
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Parse + validate the model output. Throws on malformed JSON; silently
 * drops information-free blocks (empty text) per the no-fabrication rule.
 */
export function parseRecognitionResult(raw: string): PageRecognition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("recognition output was not valid JSON");
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const qualityRaw = (obj.quality ?? {}) as Record<string, unknown>;
  const issues: QualityIssue[] = Array.isArray(qualityRaw.issues)
    ? qualityRaw.issues
        .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
        .map((i) => ({
          code: typeof i.code === "string" ? i.code : "other",
          message: typeof i.message === "string" ? i.message : "Image quality problem.",
        }))
        .slice(0, 10)
    : [];
  const ok = qualityRaw.ok !== false;

  const pageNumber =
    typeof obj.page_number === "number" && Number.isInteger(obj.page_number) && obj.page_number > 0
      ? obj.page_number
      : null;

  const blocksRaw = Array.isArray(obj.blocks) ? obj.blocks : [];
  const blocks: RecognizedBlockDraft[] = [];
  for (const b of blocksRaw.slice(0, MAX_BLOCKS_PER_PAGE)) {
    if (typeof b !== "object" || b === null) continue;
    const rec = b as Record<string, unknown>;
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    if (text === "") continue; // never persist information-free blocks
    const annotation = (ANNOTATION_TYPES as readonly string[]).includes(
      rec.annotation_type as string,
    )
      ? (rec.annotation_type as AnnotationType)
      : "other";
    const locRaw = (rec.location ?? {}) as Record<string, unknown>;
    blocks.push({
      text,
      confidence: clamp01(rec.confidence),
      annotation_type: annotation,
      location: {
        description: typeof locRaw.description === "string" ? locRaw.description : "",
      },
      question_position:
        typeof rec.question_position === "number" && Number.isInteger(rec.question_position)
          ? rec.question_position
          : null,
      anchor: typeof rec.anchor === "string" && rec.anchor.trim() ? rec.anchor.trim() : null,
      interpretation_confidence:
        typeof rec.interpretation_confidence === "number"
          ? clamp01(rec.interpretation_confidence)
          : null,
    });
  }

  return { quality: { ok, issues }, page_number: pageNumber, blocks };
}

/** Map validated drafts to recognized_blocks rows, resolving question ids. */
export function blocksToRows(
  blocks: RecognizedBlockDraft[],
  ctx: {
    pageImageId: string;
    userId: string;
    questions: RecognitionQuestionContext[];
  },
): Array<Record<string, unknown>> {
  const idByPosition = new Map<number, string>();
  for (const q of ctx.questions) idByPosition.set(q.position, q.id);
  return blocks.map((b) => ({
    page_image_id: ctx.pageImageId,
    user_id: ctx.userId,
    text: b.text,
    confidence: b.confidence,
    annotation_type: b.annotation_type,
    interpretation_confidence: b.interpretation_confidence,
    location: b.location,
    linked_question_id:
      b.question_position !== null ? (idByPosition.get(b.question_position) ?? null) : null,
    linked_anchor: b.anchor,
  }));
}
