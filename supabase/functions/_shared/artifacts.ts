// Final artifacts (Phases 6–7 of docs/research-workflow/06-…): pure logic
// for the student-contribution model, the synthesis prompts, and strict
// spec validation — including the no-fabricated-citations filter. File
// assembly (docx/pptx) lives in artifact-files.ts; I/O in the
// final-artifacts Edge Function. Tested by _tests/artifacts.test.ts.

// deno-lint-ignore-file no-explicit-any

// ---------------------------------------------------------------------------
// Student contribution model: everything the student verifiably contributed,
// assembled from confirmed material. Corrections always win over the
// machine reading; provenance (written vs dictated) is preserved.

export interface VerifiedMaterialInput {
  questions: Array<{ id: string; position: number; prompt: string }>;
  blocks: Array<{
    id: string;
    text: string;
    annotation_type: string;
    location: string | null;
    linked_question_id: string | null;
    linked_anchor: string | null;
  }>;
  segments: Array<{
    id: string;
    transcript: string;
    resolved_target: {
      question?: number;
      page?: number;
      anchor?: string;
      followup?: number;
    } | null;
  }>;
  corrections: Array<{
    block_id: string | null;
    segment_id: string | null;
    corrected_text: string | null;
  }>;
}

export function buildVerifiedMaterial(input: VerifiedMaterialInput): string {
  const blockCorrection = new Map<string, string>();
  const segmentCorrection = new Map<string, string>();
  for (const c of input.corrections) {
    if (c.block_id && c.corrected_text) blockCorrection.set(c.block_id, c.corrected_text);
    if (c.segment_id && c.corrected_text) segmentCorrection.set(c.segment_id, c.corrected_text);
  }
  const blockText = (b: VerifiedMaterialInput["blocks"][number]) =>
    blockCorrection.get(b.id) ?? b.text;
  const segmentText = (s: VerifiedMaterialInput["segments"][number]) =>
    segmentCorrection.get(s.id) ?? s.transcript;

  const parts: string[] = [];
  const ordered = [...input.questions].sort((a, b) => a.position - b.position);
  for (const q of ordered) {
    const answers = input.blocks
      .filter((b) => b.linked_question_id === q.id && b.annotation_type === "response")
      .map((b) => `- (written) ${blockText(b)}`);
    const dictated = input.segments
      .filter((s) => s.resolved_target?.question === q.position)
      .map((s) => `- (dictated) ${segmentText(s)}`);
    if (answers.length + dictated.length === 0) continue;
    parts.push(
      `QUESTION ${q.position}: ${q.prompt}\nSTUDENT'S ANSWER:\n${[...answers, ...dictated].join("\n")}`,
    );
  }

  const notes = input.blocks
    .filter((b) => !(b.linked_question_id && b.annotation_type === "response"))
    .map((b) => {
      const where = b.linked_anchor ?? b.location ?? "margin";
      return `- (${b.annotation_type}, at ${where}) ${blockText(b)}`;
    });
  if (notes.length > 0) {
    parts.push(`MARGIN NOTES AND MARKS:\n${notes.join("\n")}`);
  }

  const unplaced = input.segments
    .filter((s) => !s.resolved_target?.question)
    .map((s) => {
      const t = s.resolved_target;
      const where =
        t?.anchor ??
        (t?.page ? `page ${t.page}` : t?.followup ? `follow-up ${t.followup}` : "unplaced");
      return `- (dictated, ${where}) ${segmentText(s)}`;
    });
  if (unplaced.length > 0) {
    parts.push(`OTHER DICTATED MATERIAL:\n${unplaced.join("\n")}`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Document spec (final paper).

export interface DocumentSection {
  heading: string;
  paragraphs: string[];
  bullets: string[] | null;
  table: { headers: string[]; rows: string[][] } | null;
}

export interface DocumentSpec {
  title: string;
  sections: DocumentSection[];
  references: Array<{ title: string; url: string }>;
}

export function buildDocumentPrompt(args: {
  topic: string;
  packetBody: string;
  verifiedMaterial: string;
  followupReport: string | null;
}): string {
  return `You are writing a college student's FINAL PAPER from their documented
research process. The paper is the product of the student's work, never a
substitute for it: the student's confirmed answers, notes, and questions
below must RESHAPE the emphasis, organization, interpretation, examples,
argument, and conclusions — never be merely appended.

Rules:
- Use the student's phrasing, vocabulary, judgments, and stated beliefs ONLY
  to the extent their material supports it. NEVER invent experiences,
  opinions, or personal details the student did not state. Where
  student-authored material is thin, use a clear academic style and insert
  "[Add your own view here: …]" markers for personal revision.
- Preserve the distinction between what the evidence establishes, what the
  student believes, what the student experienced, and what remains
  uncertain — in prose.
- References may ONLY cite sources that appear in the research below —
  no fabricated citations. Every reference needs its URL.
- Structure (~3–4 pages of content): research question; concise context;
  major findings; evidence; ${
    args.followupReport
      ? "findings from follow-up research (clearly marked as the second pass); "
      : ""
  }the student's interpretation; personal or local connection where the
  student supplied one; uncertainties or competing explanations; practical
  validation or next step; conclusion.
- Tables are welcome where they genuinely clarify (comparisons, timelines).
  No decorative content. No emoji. No AI-tell filler.

Respond with ONLY a JSON object, no markdown fence, in this exact shape:
{
  "title": <string>,
  "sections": [
    { "heading": <string>,
      "paragraphs": [<string>, …],
      "bullets": [<string>, …] or null,
      "table": { "headers": [<string>], "rows": [[<string>]] } or null }
  ],
  "references": [ { "title": <string>, "url": <string> } ]
}

TOPIC: ${args.topic}

THE RESEARCH PACKET (the evidence base, with sources):
<<<PACKET
${args.packetBody}
PACKET>>>
${
  args.followupReport
    ? `\nFOLLOW-UP RESEARCH FINDINGS (second pass):\n<<<FOLLOWUP\n${args.followupReport}\nFOLLOWUP>>>\n`
    : ""
}
THE STUDENT'S VERIFIED CONTRIBUTIONS:
<<<STUDENT
${args.verifiedMaterial || "(none — use clear academic style and mark places for personal revision)"}
STUDENT>>>`;
}

const MAX_SECTIONS = 24;

/**
 * Validate the document spec. References not present in the provenance
 * text are dropped (no fabricated citations) and counted for the audit
 * trail. Throws on a structurally unusable document.
 */
export function parseDocumentSpec(
  raw: string,
  allowedSourceText: string,
): { spec: DocumentSpec; droppedReferences: number } {
  const doc = parseJsonObject(raw, "document");
  const title = typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : null;
  if (!title) throw new Error("document spec has no title");
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    throw new Error("document spec has no sections");
  }

  const sections: DocumentSection[] = [];
  for (const s of doc.sections.slice(0, MAX_SECTIONS)) {
    if (!s || typeof s !== "object") continue;
    const heading = typeof s.heading === "string" ? s.heading.trim() : "";
    const paragraphs = Array.isArray(s.paragraphs)
      ? s.paragraphs
          .filter((p: unknown) => typeof p === "string" && p.trim())
          .map((p: string) => p.trim())
      : [];
    const bullets = Array.isArray(s.bullets)
      ? s.bullets
          .filter((b: unknown) => typeof b === "string" && b.trim())
          .map((b: string) => b.trim())
      : [];
    let table: DocumentSection["table"] = null;
    if (s.table && typeof s.table === "object" && Array.isArray(s.table.headers)) {
      const headers = s.table.headers.map((h: unknown) => String(h ?? ""));
      const rows = Array.isArray(s.table.rows)
        ? s.table.rows
            .filter((r: unknown) => Array.isArray(r))
            .map((r: unknown[]) => r.map((c) => String(c ?? "")))
        : [];
      if (headers.length > 0 && rows.length > 0) table = { headers, rows };
    }
    if (!heading && paragraphs.length === 0 && bullets.length === 0 && !table) continue;
    sections.push({
      heading: heading || "…",
      paragraphs,
      bullets: bullets.length > 0 ? bullets : null,
      table,
    });
  }
  if (sections.length === 0) throw new Error("document spec has no usable sections");

  let dropped = 0;
  const references: DocumentSpec["references"] = [];
  if (Array.isArray(doc.references)) {
    for (const r of doc.references) {
      const url = typeof r?.url === "string" ? r.url.trim() : "";
      const rTitle = typeof r?.title === "string" && r.title.trim() ? r.title.trim() : url;
      if (!url || !/^https?:\/\//.test(url)) {
        dropped++;
        continue;
      }
      // The provenance rule: a citation must exist in the source material.
      if (!allowedSourceText.includes(url)) {
        dropped++;
        continue;
      }
      references.push({ title: rTitle, url });
    }
  }

  return { spec: { title, sections, references }, droppedReferences: dropped };
}

// ---------------------------------------------------------------------------
// Presentation spec (class presentation) — built FROM the approved paper.

export interface SlideSpec {
  title: string;
  bullets: string[];
  notes: string;
}

export interface PresentationSpec {
  title: string;
  slides: SlideSpec[];
}

export const MIN_SLIDES = 7;
export const MAX_SLIDES = 10;

export function buildPresentationPrompt(documentSpec: DocumentSpec): string {
  return `You are building a college student's CLASS PRESENTATION from their
final paper (below). Slides support speaking — they never replace it.

Rules:
- ${MIN_SLIDES}–${MAX_SLIDES} slides, adapted to the topic. Typical arc: title and inquiry;
  why the question matters; essential context; major finding; evidence;
  challenge or uncertainty; what changed after follow-up research; the
  student's interpretation or lived connection; validation plan or proposed
  action; a class discussion question.
- Slide titles are SHORT ASSERTIONS (a claim, not a label). One idea per
  slide. At most 4 short bullets per slide — never paste paragraphs.
- Speaker notes carry the prose: 2–4 spoken sentences per slide drawn from
  the paper.
- Claims on slides must come from the paper. No new facts, no new sources.
- No emoji. No decoration for its own sake.

Respond with ONLY a JSON object, no markdown fence:
{ "title": <string>,
  "slides": [ { "title": <string>, "bullets": [<string>], "notes": <string> } ] }

THE FINAL PAPER:
<<<PAPER
${JSON.stringify(documentSpec)}
PAPER>>>`;
}

export function parsePresentationSpec(raw: string): PresentationSpec {
  const doc = parseJsonObject(raw, "presentation");
  const title = typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : null;
  if (!title) throw new Error("presentation spec has no title");
  if (!Array.isArray(doc.slides) || doc.slides.length === 0) {
    throw new Error("presentation spec has no slides");
  }
  const slides: SlideSpec[] = [];
  for (const s of doc.slides.slice(0, MAX_SLIDES)) {
    if (!s || typeof s !== "object") continue;
    const slideTitle = typeof s.title === "string" ? s.title.trim() : "";
    if (!slideTitle) continue;
    const bullets = Array.isArray(s.bullets)
      ? s.bullets
          .filter((b: unknown) => typeof b === "string" && b.trim())
          .map((b: string) => b.trim())
          .slice(0, 5)
      : [];
    slides.push({
      title: slideTitle,
      bullets,
      notes: typeof s.notes === "string" ? s.notes.trim() : "",
    });
  }
  if (slides.length === 0) throw new Error("presentation spec has no usable slides");
  return { title, slides };
}

// ---------------------------------------------------------------------------

function parseJsonObject(raw: string, what: string): any {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let doc: any;
  try {
    doc = JSON.parse(unfenced);
  } catch {
    throw new Error(`${what} spec is not valid JSON`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`${what} spec must be a JSON object`);
  }
  return doc;
}
