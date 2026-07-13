// Follow-up research + final DOCX/PPTX support: prompt builders and
// fetch-back persistence. Kept in one module because they share the same
// input model (a prior packet + verified student responses + follow-up
// questions) and the same completion-path shape (fetchRunResult → persist →
// advance workflow_stage → settle credits).
//
// Provenance guarantees (docs/research-workflow/BACKEND-CONTRACTS.md):
//   - Follow-up research writes a NEW packets row (version = prior + 1,
//     supersedes_packet_id = prior). The original packet is never mutated.
//   - Final artifacts write to the private `final-artifacts` bucket under
//     `{user_id}/{piece_id}/…`; the row is updated by run_id so a redelivery
//     never orphans or duplicates the artifact.

// deno-lint-ignore-file no-explicit-any
import { fetchBinaryFromBranch } from "./complete.ts";
import { validateOoxmlArtifact } from "./ooxml.ts";
import { parsePacketAnalysis, parsePacketQuestions } from "./packet.ts";

/**
 * The fetched final-artifact binary failed structural validation. Terminal
 * for the run: the branch content is immutable, so re-fetching can never
 * heal it — callers must fail the run instead of leaving it in
 * awaiting_fetch for an eternal re-sweep.
 */
export class FinalArtifactInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalArtifactInvalidError";
  }
}

// ---------------------------------------------------------------------------
// Prompt inputs
// ---------------------------------------------------------------------------

export interface FollowUpPromptInput {
  pieceSlug: string;
  priorVersion: number;
  priorPacketAnalysis: unknown | null;
  approvedQuestions: Array<{ position: number; text: string }>;
  verifiedResponses: Array<{ prompt: string; response: string }>;
  studentContributions: Array<{ kind: string; text: string }>;
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
}

export interface FinalArtifactPromptInput {
  pieceSlug: string;
  goal: string | null;
  styleText: string;
  imageStyle?: string;
  packetBody: string | null;
  packetAnalysis: unknown | null;
  verifiedResponses: Array<{ prompt: string; response: string }>;
  followupSummary: string | null;
  studentContributions: Array<{ kind: string; text: string }>;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function jsonBlock(label: string, value: unknown): string {
  return `${label}:\n<<<${label}\n${JSON.stringify(value ?? null, null, 2)}\n${label}>>>\n`;
}

function verifiedBlock(verified: Array<{ prompt: string; response: string }>): string {
  if (verified.length === 0) return "STUDENT_RESPONSES: (none captured yet)\n";
  const lines = verified.map((v, i) => `${i + 1}. Q: ${v.prompt}\n   A: ${v.response}`);
  return `STUDENT_RESPONSES (verified transcripts of the student's handwriting/dictation):\n<<<RESPONSES\n${lines.join("\n\n")}\nRESPONSES>>>\n`;
}

export function buildFollowUpPrompt(input: FollowUpPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  const nextVersion = input.priorVersion + 1;
  const qBlock = input.approvedQuestions.map((q) => `${q.position}. ${q.text}`).join("\n");
  const contributions = input.studentContributions.map((c) => `- (${c.kind}) ${c.text}`).join("\n");
  return `You are running FOLLOW-UP RESEARCH on an existing research packet.

You are NOT allowed to modify the prior packet. Your outputs go to a NEW
directory: ${dir}/followup/ . Do NOT touch ${dir}/packet/ files.

Read first:
- contract/references/MARKUP.md — annotation protocol.
- The prior packet analysis is included inline below (PRIOR_ANALYSIS).

TASK — produce three files, in this order:

PHASE A — Answer the approved follow-up questions with authoritative sources.
Write ${dir}/followup/report.md (Markdown). For each approved question, write
one section:
  ## Question {n}: {verbatim question text}
  A short prose answer. Every claim carries an inline markdown link to its
  source. When the evidence is thin, say so — do NOT invent facts.
End with a "Sources" section listing every URL cited.

PHASE B — Structured analysis of the new evidence.
Write ${dir}/followup/analysis.json using the SAME schema the original packet
run used (claims/evidence/methods/stakeholders/uncertainties). Reference the
prior claim ids where the new evidence confirms or contradicts them.

PHASE C — Tailored questions for the student to reflect on the new evidence.
Write ${dir}/followup/questions.json using the SAME schema
({ questions: [{ position, function, claim_ref, prompt, guidance, response_space }] }).
Keep it small (3–5 questions) and specific to what the new evidence
established or unsettled.

Finally: commit ALL files to your working branch with message
"followup(${input.pieceSlug}): v${nextVersion} research". Do NOT open a PR.

APPROVED FOLLOW-UP QUESTIONS (research these; wording is the student's):
<<<QUESTIONS
${qBlock || "(none — refuse to run)"}
QUESTIONS>>>

${verifiedBlock(input.verifiedResponses)}
STUDENT CONTRIBUTIONS (reflections, style samples, decisions the student
wants factored into follow-up framing — treat as context, not as sources):
<<<CONTRIBUTIONS
${contributions || "(none)"}
CONTRIBUTIONS>>>

${jsonBlock("PRIOR_ANALYSIS", input.priorPacketAnalysis)}
`;
}

function contributionsBlock(contributions: Array<{ kind: string; text: string }>): string {
  const lines = contributions.map((c) => `- (${c.kind}) ${c.text}`).join("\n");
  return `STUDENT CONTRIBUTIONS (reflections, beliefs, experiences, preferences —
let these reshape emphasis and organization; never invent ones not listed):
<<<CONTRIBUTIONS
${lines || "(none)"}
CONTRIBUTIONS>>>
`;
}

// The document/slide design rules below are the product's Office visual
// system (docs/research-workflow/06-final-artifacts.md, "Visual system" in
// docs/ARTIFACT-QUALITY-REVIEW.md). tests/office-samples.ts is the reference
// implementation — a generated sample is validated against these same rules
// by tests/office-artifacts.test.ts. Change them together.

export function buildFinalDocxPrompt(input: FinalArtifactPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  return `You are producing the FINAL DOCUMENT for a research piece as a fully-formed
.docx binary at ${dir}/final/document.docx.

Do NOT write any other deliverable in this run. The file MUST be a valid
Office Open XML document (Word can open it). Use a Node/TS or Python DOCX
library available in your environment (e.g. \`docx\` on npm or
\`python-docx\`) — pick whichever is installed and generate the file
programmatically. Do not hand-craft the OOXML.

Structure (mandatory):
1. Title page — the piece goal or inferred title, the student's name if in
   contributions, the date.
2. Executive summary — 200–350 words in the student's voice (see VOICE).
3. Body — the packet's major findings, integrated with any follow-up
   evidence (clearly marked as second-pass findings) and re-cast in the
   student's voice. Preserve every source URL as a Word hyperlink.
4. Verified responses — the student's own words (verbatim) framed by short
   editorial glue.
5. Uncertainties and next steps — plainly stated.
6. Sources — every URL from the packet + follow-up, one per line, as real
   hyperlinks.

Document design (mandatory — the file must open clean in Word with zero
manual cleanup):
- US Letter page, portrait, 1in margins on all sides.
- Use real Word paragraph styles for ALL text: Title on the title page,
  Heading 1 for the numbered sections, Heading 2 for subsections (never
  skip a level), Normal for body. Never fake a heading with bold direct
  formatting; never switch fonts mid-document.
- Typography: one serif family for everything (built-in Georgia or
  Cambria is fine), body 11–12pt with line spacing ~1.15–1.4 and ~6–10pt
  space AFTER each paragraph set in the style — never blank paragraphs as
  spacing, never two empty paragraphs anywhere.
- Color: near-black body text; at most ONE muted accent (deep green
  #1F4D3A or burnt orange #B45309) used only for headings or thin rules.
  Everything must survive grayscale printing.
- Footer with a page number field on every page after the title page.
- Tables (if any): one consistent style, real header row, no nested
  tables, no table used for layout.
- Set the document core properties: title = the piece title, author = the
  student's name if known (else "Hardcopy Draft"), and the date.
- Accessibility: correct heading order, alt text on any image, header
  rows marked on tables.
- Length: about 3–5 pages excluding Sources. Do not pad.

Non-negotiables:
- Never invent facts, statistics, quotes, or sources.
- No emoji, no AI-tell filler, no decorative clip art.
- Keep the student's verified words verbatim; you may add editorial glue
  around them but do NOT paraphrase their responses.
- Before committing, re-open the generated file with the same library and
  confirm it parses; a corrupt artifact fails the whole run.

Finally: commit the file to your working branch with message
"final-docx(${input.pieceSlug}): final document". Do NOT open a PR.

GOAL:
${input.goal?.trim() || "(none — infer from the packet)"}

VOICE (inline; the student's voice profile):
<<<VOICE
${input.styleText.trim() || "(neutral academic register)"}
VOICE>>>

${verifiedBlock(input.verifiedResponses)}
${contributionsBlock(input.studentContributions)}
FOLLOWUP SUMMARY (may be empty):
<<<FOLLOWUP
${input.followupSummary?.trim() || "(none)"}
FOLLOWUP>>>

${jsonBlock("PACKET_ANALYSIS", input.packetAnalysis)}
PACKET BODY (verbatim):
<<<PACKET
${input.packetBody?.trim() || "(missing)"}
PACKET>>>
`;
}

export function buildFinalPptxPrompt(input: FinalArtifactPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  return `You are producing the FINAL PRESENTATION for a research piece as a valid
.pptx binary at ${dir}/final/presentation.pptx.

Do NOT write any other deliverable in this run. Use a PPTX library available
in your environment (e.g. \`pptxgenjs\` on npm or \`python-pptx\`).

Slide plan (8–12 slides):
1. Title — piece title + student name if known.
2. The research question and why it matters.
3–6. Major findings (one per slide) with the strongest evidence and a source
     line at the bottom.
7. Verified student responses (paraphrased headline, verbatim quote in the
   speaker notes).
8. Uncertainties.
9. Follow-up findings (only if a follow-up summary is provided).
10. Sources (list every URL).

Slide design (mandatory — the deck must be presentable with zero manual
cleanup):
- 16:9 slide size (13.33 × 7.5 in).
- Define ONE look and reuse it on every slide: warm cream background
  (#F7F4EC) or white, charcoal text (#222222), and a single accent (deep
  green #1F4D3A or burnt orange #B45309) used only for the title text or
  one thin rule under it. No per-slide theme changes, no gradients, no
  decorative shapes or unexplained icons.
- Typography: slide titles 28–32pt, body 18–24pt, source lines 11–12pt.
  Nothing below 11pt anywhere. One serif family for titles + one quiet
  sans-serif (or the same serif) for body — never vary fonts per slide.
- One idea per slide: the title is a short assertion (not a label like
  "Finding 2"); at most ~40 words of body content (3–5 short bullets or
  one short quote). Full prose goes in the speaker notes, never on the
  slide. Do NOT paste document paragraphs onto slides.
- Consistent geometry: identical title position on every slide; keep all
  content at least 0.5in from every slide edge; nothing may overflow or
  touch the edge.
- Slide numbers bottom-right on every slide after the title slide.
- The source line sits at the bottom of the slide it supports, small and
  muted.
- Speaker notes on every content slide: 2–5 sentences the student could
  actually say, in the VOICE below.
- Set the deck's core properties: title = the piece title, author = the
  student's name if known (else "Hardcopy Draft").

Non-negotiables:
- Grayscale-safe: no color-only encoding of information.
- No emoji.
- Every source URL appears on the slide it supports AND on the Sources slide.
- Keep the student's verified words verbatim in speaker notes; on slides you
  may paraphrase the headline but never the quote.
- Before committing, re-open the generated file with the same library and
  confirm it parses; a corrupt artifact fails the whole run.

Finally: commit the file to your working branch with message
"final-pptx(${input.pieceSlug}): final presentation". Do NOT open a PR.

GOAL:
${input.goal?.trim() || "(none — infer from the packet)"}

VOICE (inline; keep slide phrasing and the speaker notes consistent with it):
<<<VOICE
${input.styleText.trim() || "(neutral academic register)"}
VOICE>>>

${verifiedBlock(input.verifiedResponses)}
${contributionsBlock(input.studentContributions)}
FOLLOWUP SUMMARY (may be empty):
<<<FOLLOWUP
${input.followupSummary?.trim() || "(none)"}
FOLLOWUP>>>

${jsonBlock("PACKET_ANALYSIS", input.packetAnalysis)}
PACKET BODY (verbatim):
<<<PACKET
${input.packetBody?.trim() || "(missing)"}
PACKET>>>
`;
}

// ---------------------------------------------------------------------------
// Context assembly — used by both dispatch and persistence
// ---------------------------------------------------------------------------

export interface AssemblyQuestion {
  id: string;
  prompt: string;
}
export interface AssemblyBlock {
  id: string;
  text: string;
  linked_question_id: string | null;
}
export interface AssemblySegment {
  id: string;
  transcript: string;
  resolved_target: unknown;
}
export interface AssemblyCorrection {
  block_id: string | null;
  segment_id: string | null;
  corrected_text: string;
  corrected_meaning: unknown;
  verified_at: string;
}

/**
 * A correction may carry the student's final say on which question the item
 * answers (`corrected_meaning.questionId`, written by the review screen):
 * present-and-string reassigns, present-and-null unlinks, absent keeps the
 * recognition's linkage.
 */
function correctedQuestionId(c: AssemblyCorrection | undefined, fallback: string | null) {
  const m = c?.corrected_meaning;
  if (m && typeof m === "object" && "questionId" in (m as Record<string, unknown>)) {
    const v = (m as Record<string, unknown>).questionId;
    return typeof v === "string" && v ? v : null;
  }
  return fallback;
}

/**
 * The verified student response set fed into every downstream prompt
 * (follow-up research, final DOCX, final PPTX). Rules — mirrored from
 * src/lib/verification.ts on the client:
 *   - corrections are append-only; the latest one per block/segment wins,
 *   - empty corrected_text is a rejection: the item is dropped,
 *   - corrected_meaning.questionId can reassign or unlink the target question,
 *   - dictation segments count exactly like handwriting blocks,
 *   - only items resolvable to a known question survive (prompts are the
 *     join key downstream); multiple answers to one question are joined.
 */
export function assembleVerifiedResponses(src: {
  questions: AssemblyQuestion[];
  blocks: AssemblyBlock[];
  segments: AssemblySegment[];
  corrections: AssemblyCorrection[];
}): Array<{ prompt: string; response: string }> {
  const promptById = new Map(src.questions.map((q) => [q.id, q.prompt]));

  const byBlock = new Map<string, AssemblyCorrection>();
  const bySegment = new Map<string, AssemblyCorrection>();
  const ordered = [...src.corrections].sort((a, b) => a.verified_at.localeCompare(b.verified_at));
  for (const c of ordered) {
    if (c.block_id) byBlock.set(c.block_id, c);
    if (c.segment_id) bySegment.set(c.segment_id, c);
  }

  const answersByQ = new Map<string, string[]>();
  const add = (qid: string | null, text: string) => {
    if (!qid || !promptById.has(qid)) return;
    const t = text.trim();
    if (!t) return;
    const arr = answersByQ.get(qid) ?? [];
    arr.push(t);
    answersByQ.set(qid, arr);
  };

  for (const b of src.blocks) {
    const c = byBlock.get(b.id);
    if (c && c.corrected_text.trim() === "") continue; // rejected at review
    add(correctedQuestionId(c, b.linked_question_id), c ? c.corrected_text : b.text);
  }
  for (const s of src.segments) {
    const c = bySegment.get(s.id);
    if (c && c.corrected_text.trim() === "") continue;
    const target = s.resolved_target as Record<string, unknown> | null;
    const fallback =
      typeof target?.questionId === "string" && target.questionId ? target.questionId : null;
    add(correctedQuestionId(c, fallback), c ? c.corrected_text : s.transcript);
  }

  const out: Array<{ prompt: string; response: string }> = [];
  for (const q of src.questions) {
    const answers = answersByQ.get(q.id);
    if (answers && answers.length > 0) out.push({ prompt: q.prompt, response: answers.join("\n") });
  }
  return out;
}

/**
 * Load everything the follow-up/final prompts need. `packetId` selects the
 * packet whose follow-up questions apply (defaults to the latest version).
 * Verified responses span ALL packet versions of the piece — returns and
 * dictation attach to the version the student worked on paper, which is not
 * necessarily the latest one once follow-up research has produced a v2.
 */
export async function loadPriorPacketContext(
  admin: any,
  pieceId: string,
  packetId?: string,
): Promise<{
  packet: { id: string; version: number; analysis: unknown | null } | null;
  approvedQuestions: Array<{ position: number; text: string }>;
  verifiedResponses: Array<{ prompt: string; response: string }>;
  studentContributions: Array<{ kind: string; text: string }>;
}> {
  const { data: allPackets } = await admin
    .from("packets")
    .select("id, version, analysis")
    .eq("piece_id", pieceId)
    .order("version", { ascending: false });
  const packets: Array<{ id: string; version: number; analysis: unknown | null }> =
    allPackets ?? [];
  const packet = (packetId ? packets.find((p) => p.id === packetId) : packets[0]) ?? null;
  if (!packet) {
    return { packet: null, approvedQuestions: [], verifiedResponses: [], studentContributions: [] };
  }
  const packetIds = packets.map((p) => p.id);

  const { data: fq } = await admin
    .from("followup_questions")
    .select("position, student_text, approved_text, status")
    .eq("packet_id", packet.id)
    .in("status", ["approved", "researched"])
    .order("position", { ascending: true });
  const approvedQuestions = (fq ?? [])
    .map((r: any) => ({
      position: r.position,
      text: (r.approved_text ?? r.student_text ?? "").trim(),
    }))
    .filter((r: any) => r.text.length > 0);

  const { data: pqs } = await admin
    .from("packet_questions")
    .select("id, prompt")
    .in("packet_id", packetIds)
    .order("packet_id", { ascending: true })
    .order("position", { ascending: true });

  const { data: returns } = await admin
    .from("packet_returns")
    .select("id")
    .in("packet_id", packetIds);
  const returnIds = (returns ?? []).map((r: any) => r.id as string);

  let blocks: AssemblyBlock[] = [];
  if (returnIds.length > 0) {
    const { data: pages } = await admin.from("page_images").select("id").in("return_id", returnIds);
    const pageIds = (pages ?? []).map((p: any) => p.id as string);
    if (pageIds.length > 0) {
      const { data: blockRows } = await admin
        .from("recognized_blocks")
        .select("id, text, linked_question_id")
        .in("page_image_id", pageIds);
      blocks = (blockRows ?? []) as AssemblyBlock[];
    }
  }

  const { data: segmentRows } = await admin
    .from("dictation_segments")
    .select("id, transcript, resolved_target")
    .in("packet_id", packetIds);
  const segments = (segmentRows ?? []) as AssemblySegment[];

  // Two indexed queries (one per FK), deduped by row id — a correction row
  // carrying both FKs must not be applied twice.
  const byId = new Map<string, AssemblyCorrection>();
  const blockIds = blocks.map((b) => b.id);
  const segmentIds = segments.map((s) => s.id);
  const correctionSelect =
    "id, block_id, segment_id, corrected_text, corrected_meaning, verified_at";
  if (blockIds.length > 0) {
    const { data } = await admin
      .from("verification_corrections")
      .select(correctionSelect)
      .in("block_id", blockIds);
    for (const c of data ?? []) byId.set(c.id as string, c as AssemblyCorrection);
  }
  if (segmentIds.length > 0) {
    const { data } = await admin
      .from("verification_corrections")
      .select(correctionSelect)
      .in("segment_id", segmentIds);
    for (const c of data ?? []) byId.set(c.id as string, c as AssemblyCorrection);
  }
  const corrections = Array.from(byId.values());

  const verifiedResponses = assembleVerifiedResponses({
    questions: (pqs ?? []) as AssemblyQuestion[],
    blocks,
    segments,
    corrections,
  });

  const { data: contribs } = await admin
    .from("student_contributions")
    .select("kind, text")
    .in("packet_id", packetIds);
  const studentContributions = (contribs ?? []).map((c: any) => ({
    kind: c.kind as string,
    text: c.text as string,
  }));

  return {
    packet: {
      id: packet.id as string,
      version: packet.version as number,
      analysis: packet.analysis ?? null,
    },
    approvedQuestions,
    verifiedResponses,
    studentContributions,
  };
}

// ---------------------------------------------------------------------------
// Fetch-back persistence
// ---------------------------------------------------------------------------

function fileFromResult(result: any, name: string): string | null {
  if (!result || !Array.isArray(result.channels)) return null;
  for (const ch of result.channels) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files) {
      if (f?.name === name && typeof f.content === "string") return f.content;
    }
  }
  return null;
}

/**
 * The packet body (v1 post.md) and the latest follow-up report, read from the
 * persisted run results — the final DOCX/PPTX prompts carry both verbatim so
 * the artifact is built from the actual findings, not from repo-path hints.
 */
export async function loadPacketBodies(
  admin: any,
  pieceId: string,
): Promise<{ packetBody: string | null; followupSummary: string | null }> {
  const { data: packets } = await admin
    .from("packets")
    .select("version, run_id")
    .eq("piece_id", pieceId)
    .order("version", { ascending: true });
  let packetBody: string | null = null;
  let followupSummary: string | null = null;
  for (const p of packets ?? []) {
    if (!p.run_id) continue;
    const { data: run } = await admin
      .from("agent_runs")
      .select("result")
      .eq("id", p.run_id)
      .maybeSingle();
    const body = fileFromResult(run?.result, "post.md");
    if (!body) continue;
    if (p.version === 1) packetBody = body;
    else followupSummary = body; // ascending order → the latest follow-up wins
  }
  return { packetBody, followupSummary };
}

/**
 * Persist a completed follow-up research run.
 * Writes a NEW packets row (version = prior + 1, supersedes_packet_id = prior).
 * Idempotent: onConflict on run_id skips a redelivered fetch-back.
 * Never mutates the prior packet.
 */
export async function persistFollowUpResult(
  admin: any,
  run: { id: string; user_id: string; piece_id: string | null; input: any },
  result: any,
): Promise<void> {
  if (!run.piece_id) throw new Error("follow-up run has no piece");

  // Prefer explicit priorVersion recorded at dispatch; fall back to the
  // highest existing version on the piece.
  let priorVersion: number = Number(run.input?.priorVersion) || 0;
  let priorPacketId: string | null = run.input?.priorPacketId ?? null;
  if (!priorVersion || !priorPacketId) {
    const { data: prior } = await admin
      .from("packets")
      .select("id, version")
      .eq("piece_id", run.piece_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    priorVersion = prior?.version ?? 1;
    priorPacketId = prior?.id ?? null;
  }

  const analysisRaw = fileFromResult(result, "analysis.json");
  const questionsRaw = fileFromResult(result, "questions.json");
  let analysis: Record<string, unknown> | null = null;
  const problems: string[] = [];
  if (analysisRaw) {
    try {
      analysis = parsePacketAnalysis(analysisRaw);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  let parsedQuestions: ReturnType<typeof parsePacketQuestions> = { questions: [], rejected: [] };
  if (questionsRaw) {
    try {
      parsedQuestions = parsePacketQuestions(questionsRaw);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Insert v+1 packet row. Upsert on run_id keeps it idempotent under
  // webhook/reconciler races. The prior packet is untouched.
  const { error: packetErr } = await admin.from("packets").upsert(
    {
      piece_id: run.piece_id,
      run_id: run.id,
      user_id: run.user_id,
      version: priorVersion + 1,
      supersedes_packet_id: priorPacketId,
      status: "generated",
      analysis,
    },
    { onConflict: "run_id", ignoreDuplicates: true },
  );
  if (packetErr) throw new Error(`followup packet upsert failed: ${packetErr.message}`);

  const { data: newPacket } = await admin
    .from("packets")
    .select("id")
    .eq("run_id", run.id)
    .maybeSingle();
  if (!newPacket) throw new Error("followup packet not readable after upsert");

  if (parsedQuestions.questions.length > 0) {
    const rows = parsedQuestions.questions.map((q) => ({
      packet_id: newPacket.id,
      user_id: run.user_id,
      position: q.position,
      function: q.function,
      claim_ref: q.claim_ref,
      prompt: q.prompt,
      guidance: q.guidance,
      response_space: q.response_space,
      source: "generated",
    }));
    const { error: qErr } = await admin
      .from("packet_questions")
      .upsert(rows, { onConflict: "packet_id,position", ignoreDuplicates: true });
    if (qErr) throw new Error(`followup packet_questions upsert failed: ${qErr.message}`);
  }

  // Flip status of the followup_questions on the PRIOR packet to 'researched'
  // so the review UI reflects that they've been answered.
  if (priorPacketId) {
    await admin
      .from("followup_questions")
      .update({ status: "researched", updated_at: new Date().toISOString() })
      .eq("packet_id", priorPacketId)
      .eq("status", "approved");
  }

  if (problems.length > 0 || parsedQuestions.rejected.length > 0) {
    await admin.from("agent_run_events").insert({
      run_id: run.id,
      source: "edge",
      event_type: "followup_validation",
      payload: {
        problems,
        rejected: parsedQuestions.rejected,
        persisted: parsedQuestions.questions.length,
      },
    });
  }
}

/**
 * Settle the pending final_artifacts row when its run fails or is cancelled —
 * without this the row sits 'pending' forever and the UI can never offer a
 * retry. Ready artifacts are never downgraded (idempotent under redelivery).
 */
export async function settleFinalArtifactFailure(
  admin: any,
  run: { id: string; kind: string },
): Promise<void> {
  if (run.kind !== "final_docx" && run.kind !== "final_pptx") return;
  await admin
    .from("final_artifacts")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("run_id", run.id)
    .neq("status", "ready");
}

/**
 * Persist a completed final DOCX/PPTX run.
 * Downloads the binary from the run's branch, uploads to the private
 * final-artifacts bucket, and updates the pending final_artifacts row.
 * Idempotent: repeated calls upsert the same storage_path and no-op on the row.
 */
export async function persistFinalArtifactResult(
  admin: any,
  run: {
    id: string;
    user_id: string;
    piece_id: string | null;
    kind: string;
    branch: string | null;
  },
  slug: string,
): Promise<void> {
  if (!run.piece_id) throw new Error("final artifact run has no piece");
  if (!run.branch) throw new Error("final artifact run has no branch");

  const isDocx = run.kind === "final_docx";
  const filename = isDocx ? "document.docx" : "presentation.pptx";
  const contentType = isDocx
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const branchPath = `pieces/${slug}/final/${filename}`;

  const bytes = await fetchBinaryFromBranch(branchPath, run.branch);
  if (!bytes) throw new Error(`final artifact missing at ${branchPath}`);

  // Structural gate: a corrupt or truncated binary must never go 'ready'.
  const validation = await validateOoxmlArtifact(bytes, isDocx ? "docx" : "pptx");
  if (!validation.ok) {
    const reason = `${filename} failed validation: ${validation.reason}`;
    await admin
      .from("final_artifacts")
      .update({
        status: "failed",
        provenance: {
          branch: run.branch,
          source_path: branchPath,
          bytes: bytes.byteLength,
          validation_error: validation.reason,
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", run.id)
      .neq("status", "ready");
    throw new FinalArtifactInvalidError(reason);
  }

  const storagePath = `${run.user_id}/${run.piece_id}/${filename}`;
  const { error: upErr } = await admin.storage
    .from("final-artifacts")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (upErr) throw new Error(`final artifact upload failed: ${upErr.message}`);

  const { error: updErr } = await admin
    .from("final_artifacts")
    .update({
      status: "ready",
      storage_path: storagePath,
      provenance: {
        branch: run.branch,
        source_path: branchPath,
        bytes: bytes.byteLength,
        completed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", run.id);
  if (updErr) throw new Error(`final_artifacts update failed: ${updErr.message}`);
}
