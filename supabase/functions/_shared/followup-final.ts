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
import { parsePacketAnalysis, parsePacketQuestions } from "./packet.ts";

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
   evidence and re-cast in the student's voice. Preserve every source URL
   as a Word hyperlink.
4. Verified responses — the student's own words (verbatim) framed by short
   editorial glue.
5. Uncertainties and next steps — plainly stated.
6. Sources — every URL from the packet + follow-up.

Non-negotiables:
- Never invent facts, statistics, quotes, or sources.
- No emoji, no AI-tell filler.
- Keep the student's verified words verbatim; you may add editorial glue
  around them but do NOT paraphrase their responses.

Finally: commit the file to your working branch with message
"final-docx(${input.pieceSlug}): final document". Do NOT open a PR.

GOAL:
${input.goal?.trim() || "(none — infer from the packet)"}

VOICE (inline; the student's voice profile):
<<<VOICE
${input.styleText.trim() || "(neutral academic register)"}
VOICE>>>

${verifiedBlock(input.verifiedResponses)}
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

Slide plan (8–14 slides):
1. Title — piece title + student name if known.
2. The research question and why it matters.
3–6. Major findings (one per slide) with the strongest evidence and a source
     line at the bottom.
7. Verified student responses (paraphrased headline, verbatim quote in the
   speaker notes).
8. Uncertainties.
9. Follow-up findings (only if a follow-up summary is provided).
10. Sources (list every URL).

Non-negotiables:
- Grayscale-safe: no color-only encoding of information.
- No emoji.
- Every source URL appears on the slide it supports AND on the Sources slide.
- Keep the student's verified words verbatim in speaker notes; on slides you
  may paraphrase the headline but never the quote.

Finally: commit the file to your working branch with message
"final-pptx(${input.pieceSlug}): final presentation". Do NOT open a PR.

GOAL:
${input.goal?.trim() || "(none — infer from the packet)"}

VOICE (inline; keep slide phrasing consistent with it):
<<<VOICE
${input.styleText.trim() || "(neutral academic register)"}
VOICE>>>

${verifiedBlock(input.verifiedResponses)}
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

export async function loadPriorPacketContext(
  admin: any,
  pieceId: string,
): Promise<{
  packet: { id: string; version: number; analysis: unknown | null } | null;
  approvedQuestions: Array<{ position: number; text: string }>;
  verifiedResponses: Array<{ prompt: string; response: string }>;
  studentContributions: Array<{ kind: string; text: string }>;
}> {
  const { data: packet } = await admin
    .from("packets")
    .select("id, version, analysis")
    .eq("piece_id", pieceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!packet) {
    return { packet: null, approvedQuestions: [], verifiedResponses: [], studentContributions: [] };
  }

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

  // Verified responses: JOIN corrections to their source block/segment, then
  // to the packet question via linked_question_id (block path). Server-side
  // filter narrows to this packet's questions.
  const { data: pqs } = await admin
    .from("packet_questions")
    .select("id, prompt")
    .eq("packet_id", packet.id);
  const promptById = new Map<string, string>();
  for (const q of pqs ?? []) promptById.set(q.id as string, q.prompt as string);

  const { data: blocks } = await admin
    .from("recognized_blocks")
    .select("id, linked_question_id, text")
    .in("linked_question_id", Array.from(promptById.keys()));
  const blockToQ = new Map<string, string>();
  const blockText = new Map<string, string>();
  for (const b of blocks ?? []) {
    if (b.linked_question_id) blockToQ.set(b.id as string, b.linked_question_id as string);
    blockText.set(b.id as string, (b.text ?? "") as string);
  }

  const { data: corrections } = await admin
    .from("verification_corrections")
    .select("block_id, corrected_text, verified_at")
    .in("block_id", Array.from(blockToQ.keys()))
    .order("verified_at", { ascending: true });
  const responseByQ = new Map<string, string>();
  // Corrections win over raw recognition; fall back to raw text when no
  // correction exists for a block linked to a question.
  for (const c of corrections ?? []) {
    const qid = blockToQ.get(c.block_id as string);
    if (qid) responseByQ.set(qid, (c.corrected_text ?? "").trim());
  }
  for (const [bid, qid] of blockToQ.entries()) {
    if (!responseByQ.has(qid)) responseByQ.set(qid, (blockText.get(bid) ?? "").trim());
  }
  const verifiedResponses: Array<{ prompt: string; response: string }> = [];
  for (const [qid, response] of responseByQ.entries()) {
    const prompt = promptById.get(qid);
    if (prompt && response) verifiedResponses.push({ prompt, response });
  }

  const { data: contribs } = await admin
    .from("student_contributions")
    .select("kind, text")
    .eq("packet_id", packet.id);
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
