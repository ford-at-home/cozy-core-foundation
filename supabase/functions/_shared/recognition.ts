// Handwriting recognition for returned packet pages (Phase 2 of
// docs/research-workflow/04-return-and-recognition.md). Pure module: prompt
// building and response validation, tested in _tests/recognition.test.ts.
// The packet-return Edge Function owns the I/O (storage download, gateway
// call, DB writes).
//
// Non-negotiables encoded here:
//   - Never fabricate unreadable text: an unreadable region comes back as an
//     empty-text block with null confidence, never invented words.
//   - Printed packet text is context, not output — only handwriting and
//     annotation marks are transcribed.
//   - Raw recognition output is never verified; verification is a separate,
//     mandatory human step.

export interface RecognitionQuestionContext {
  id: string;
  position: number;
  prompt: string;
}

export const QUALITY_CODES = [
  "blur",
  "glare",
  "cropped",
  "low_contrast",
  "too_small",
  "multiple_pages",
  "wrong_orientation",
] as const;
export type QualityCode = (typeof QUALITY_CODES)[number];

export const BLOCK_KINDS = ["response", "annotation", "followup", "note"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

// Annotation vocabulary from contract/references/MARKUP.md (reused as-is).
export const ANNOTATION_TYPES = [
  "circle",
  "arrow",
  "underline",
  "strikethrough",
  "margin_note",
  "bracket",
  "star",
  "question_mark",
  "other",
] as const;

export interface RecognizedBlockDraft {
  position: number;
  kind: BlockKind;
  text: string;
  /** null = detected but unreadable (retake or dictate; never invented). */
  confidence: number | null;
  annotation_type: string | null;
  /** Q position (1-based) the writing answers, when identifiable. */
  question_position: number | null;
  /** F.1–F.3 follow-up area index, when the block is a followup. */
  followup_index: number | null;
  /** S{n}P{m} anchor or printed identifier near the writing. */
  linked_anchor: string | null;
  location: Record<string, unknown> | null;
}

export interface PageRecognition {
  quality: { ok: boolean; issues: Array<{ code: string; message: string }> };
  page_number: number | null;
  blocks: RecognizedBlockDraft[];
}

/**
 * Prompt for one page image. The tailored questions give the model the
 * printed text it must NOT transcribe and the Q numbers it should link
 * handwriting to.
 */
export function buildRecognitionPrompt(questions: RecognitionQuestionContext[]): string {
  const questionList = questions
    .map((q) => `Q${q.position}: ${q.prompt}`)
    .join("\n");
  return [
    "You are reading one photographed page of a printed research packet that a student",
    "completed by hand. The page contains PRINTED packet text (do not transcribe it) and",
    "the student's HANDWRITTEN responses and annotation marks (transcribe these).",
    "",
    "The packet's printed questions, for reference (match handwriting to a question when",
    "the writing sits in that question's ruled response area or references its number):",
    questionList || "(no question list available)",
    "",
    "Follow-up research areas are printed as F.1, F.2, F.3 (or Q{n}.1–.3) near the end of",
    "the packet — handwriting there is a follow-up research question.",
    "",
    "Return ONLY a JSON object, no markdown fence, with this shape:",
    "{",
    '  "quality": { "ok": boolean, "issues": [{ "code": string, "message": string }] },',
    '  "page_number": number | null,',
    '  "blocks": [',
    "    {",
    '      "kind": "response" | "annotation" | "followup" | "note",',
    '      "text": string,',
    '      "confidence": number | null,',
    '      "annotation_type": string | null,',
    '      "question_position": number | null,',
    '      "followup_index": number | null,',
    '      "linked_anchor": string | null,',
    '      "location": { "area": string } | null',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    `- quality.issues codes: ${QUALITY_CODES.join(", ")}. Set ok=false only when the page`,
    "  is unusable for recognition (severe blur, glare over the writing, cut-off writing).",
    "- page_number: the printed folio number if visible, else null.",
    "- One block per distinct handwritten passage or annotation mark, in reading order.",
    "- kind=annotation for marks (circle, arrow, underline, strikethrough, margin_note,",
    "  bracket, star, question_mark); put any words written with the mark in text.",
    "- kind=followup for writing in the follow-up areas, with followup_index 1-3.",
    "- confidence: 0 to 1 for your transcription of that block.",
    "- CRITICAL: if a passage is not readable, output the block with text set to an empty",
    "  string and confidence null. NEVER guess or invent words you cannot read.",
    "- Crossed-out writing: transcribe if legible and note it in location.area as",
    '  "crossed_out"; the student decides what it means during review.',
    "- Do not transcribe printed text. Do not summarize. Do not correct spelling.",
  ].join("\n");
}

function clamp01(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function intOrNull(n: unknown): number | null {
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Validate the model's JSON for one page. Tolerates a fenced code block.
 * Throws on structurally unusable output (the caller marks the page failed
 * and asks for a retake/retry); silently drops malformed individual blocks.
 */
export function parseRecognitionResult(raw: string): PageRecognition {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1];
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("recognition output is not valid JSON");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("recognition output must be a JSON object");
  }
  const d = doc as Record<string, unknown>;

  const qualityIn = (d.quality ?? {}) as Record<string, unknown>;
  const issuesIn = Array.isArray(qualityIn.issues) ? qualityIn.issues : [];
  const issues = issuesIn
    .map((i) => {
      const it = (i ?? {}) as Record<string, unknown>;
      const code = strOrNull(it.code);
      if (!code) return null;
      return { code, message: strOrNull(it.message) ?? code };
    })
    .filter((i): i is { code: string; message: string } => i !== null);
  const ok = typeof qualityIn.ok === "boolean" ? qualityIn.ok : issues.length === 0;

  const blocksIn = Array.isArray(d.blocks) ? d.blocks : [];
  const blocks: RecognizedBlockDraft[] = [];
  for (const b of blocksIn) {
    if (!b || typeof b !== "object") continue;
    const blk = b as Record<string, unknown>;
    const kind = BLOCK_KINDS.includes(blk.kind as BlockKind) ? (blk.kind as BlockKind) : "note";
    const rawText = typeof blk.text === "string" ? blk.text.trim() : "";
    let confidence = clamp01(blk.confidence);
    // Fabrication guard, both directions: text without confidence is
    // untrusted (unreadable => must be empty), and confidence without text
    // is meaningless.
    if (rawText === "") confidence = null;
    if (confidence === null && rawText !== "") {
      // The model transcribed something but declared no confidence: keep the
      // text at the lowest confidence so verification MUST surface it.
      confidence = 0;
    }
    // A block with no text and no annotation carries no information.
    const annotationType = strOrNull(blk.annotation_type);
    if (rawText === "" && kind !== "annotation" && confidence === null && !annotationType) {
      // Keep unreadable regions only when the model flagged where they are.
      if (!blk.location) continue;
    }
    blocks.push({
      position: blocks.length,
      kind,
      text: rawText,
      confidence,
      annotation_type: annotationType,
      question_position: intOrNull(blk.question_position),
      followup_index: intOrNull(blk.followup_index),
      linked_anchor: strOrNull(blk.linked_anchor),
      location:
        blk.location && typeof blk.location === "object" && !Array.isArray(blk.location)
          ? (blk.location as Record<string, unknown>)
          : null,
    });
  }

  return {
    quality: { ok, issues },
    page_number: intOrNull(d.page_number),
    blocks,
  };
}

/** Confidence below this is highlighted as needing attention in review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Map validated blocks to recognized_blocks rows. Question linking resolves
 * the model's Q position to the packet question id; unknown positions stay
 * unlinked (the student links them in review).
 */
export function blocksToRows(args: {
  pageImageId: string;
  returnId: string;
  userId: string;
  attempt: number;
  blocks: RecognizedBlockDraft[];
  questions: RecognitionQuestionContext[];
}): Array<Record<string, unknown>> {
  const byPosition = new Map(args.questions.map((q) => [q.position, q.id]));
  return args.blocks.map((b, i) => ({
    page_image_id: args.pageImageId,
    return_id: args.returnId,
    user_id: args.userId,
    attempt: args.attempt,
    position: i,
    kind: b.kind,
    location: {
      ...(b.location ?? {}),
      ...(b.followup_index ? { followup_index: b.followup_index } : {}),
      ...(b.question_position ? { question_position: b.question_position } : {}),
    },
    text: b.text,
    confidence: b.confidence,
    annotation_type: b.annotation_type,
    linked_question_id: b.question_position
      ? (byPosition.get(b.question_position) ?? null)
      : null,
    linked_anchor: b.linked_anchor,
  }));
}
