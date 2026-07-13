// Follow-up research (Phase 5 of docs/research-workflow/05-…): pure logic
// for the second research pass and the revised packet it chains into.
// Tested by _tests/followup.test.ts; I/O stays in the Edge Functions and
// the research reconciler.

// deno-lint-ignore-file no-explicit-any

export const MAX_FOLLOWUP_QUESTIONS = 3;

export interface FollowupQuestion {
  position: number;
  text: string;
}

/**
 * The Parallel task input for a follow-up pass: targeted answers to the
 * student's questions, grounded in the original report, prioritizing
 * authoritative evidence (docs/research-workflow/05 §second research pass).
 */
export function buildFollowupQuery(args: {
  topic: string;
  questions: FollowupQuestion[];
  originalReport: string;
}): string {
  const list = args.questions.map((q, i) => `${i + 1}. ${q.text.trim()}`).join("\n");
  return `This is a FOLLOW-UP research pass. An initial deep-research report on the
topic below already exists (included at the end). A student worked through
that report critically and asked the specific questions listed here. Answer
THESE QUESTIONS — do not re-research the whole topic.

Requirements:
- Structured markdown: one section per question, in order, titled with the
  question itself.
- Prioritize authoritative, verifiable evidence: primary sources, official
  datasets, peer-reviewed work, named institutions. Weak or speculative
  evidence must be labeled as such.
- EVERY claim must carry its source URL inline as a markdown link.
- Where the new evidence CONFIRMS, CONTRADICTS, or CHANGES something in the
  original report, say so explicitly and name the original claim.
- If a question cannot be answered with credible evidence, say so plainly —
  a documented dead end is a valid answer. Never pad.
- Include a final "Sources" section listing every URL used.

TOPIC: ${args.topic.trim()}

THE STUDENT'S QUESTIONS:
${list}

ORIGINAL REPORT (context — do not re-answer it):
<<<ORIGINAL_REPORT
${args.originalReport.trim()}
ORIGINAL_REPORT>>>`;
}

/**
 * Prompt asking the gateway to suggest a sharper phrasing for each of the
 * student's follow-up questions. Refinement is visible and consensual: the
 * suggestion is shown beside the student's wording, and the student picks.
 * Responds with strict JSON.
 */
export function buildRefinementPrompt(questions: FollowupQuestion[]): string {
  const list = questions.map((q) => `${q.position}. ${q.text.trim()}`).join("\n");
  return `A student wrote follow-up research questions after critically reading a
research packet. For each question, suggest a version that is more
researchable — specific about what evidence would answer it, scoped so a
research pass can actually resolve it — while preserving the student's
intent and their line of thinking. If a question is already sharp, return it
unchanged. NEVER change what the student is asking about.

Respond with ONLY a JSON object, no markdown fence:
{ "suggestions": [ { "position": <number>, "suggested": <string>, "reason": <one short sentence, or null when unchanged> } ] }

THE STUDENT'S QUESTIONS:
${list}`;
}

export interface RefinementSuggestion {
  position: number;
  suggested: string;
  reason: string | null;
}

/** Validate the refinement response; malformed entries are dropped. */
export function parseRefinementResult(raw: string): RefinementSuggestion[] {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let doc: any;
  try {
    doc = JSON.parse(unfenced);
  } catch {
    return [];
  }
  if (!doc || !Array.isArray(doc.suggestions)) return [];
  const out: RefinementSuggestion[] = [];
  for (const s of doc.suggestions) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.position !== "number" || !Number.isInteger(s.position)) continue;
    if (typeof s.suggested !== "string" || !s.suggested.trim()) continue;
    out.push({
      position: s.position,
      suggested: s.suggested.trim(),
      reason: typeof s.reason === "string" && s.reason.trim() ? s.reason.trim() : null,
    });
  }
  return out;
}

const ORIGINAL_PACKET_PROMPT_CAP = 60_000;

/**
 * Prompt for the revised packet run (version n+1). Same three-file contract
 * as buildPacketPrompt — analysis.json, questions.json, packet.md — so
 * persistence, review, and printing all work unchanged. The body must open
 * with a "What changed" section; there is no render-strategy choice
 * (per the product's clarity rules the revised packet is ONE document).
 */
export function buildRevisedPacketPrompt(args: {
  pieceSlug: string;
  followupReport: string;
  originalPacketBody: string;
  questions: FollowupQuestion[];
  version: number;
}): string {
  const dir = `pieces/${args.pieceSlug}`;
  const list = args.questions.map((q, i) => `${i + 1}. ${q.text.trim()}`).join("\n");
  return `You are REVISING a printed research packet for a college student after a
follow-up research pass. The student read packet v${args.version - 1}, asked the
follow-up questions below, and a targeted research pass answered them. Your
job is to produce packet v${args.version}: the same packet, upgraded with the new
evidence — clearly showing what changed. You are a research-methodology
specialist, not a prose stylist. This run does NOT follow contract/SKILL.md;
follow THIS prompt exactly.

Read contract/references/MARKUP.md first — the packet body carries S{n}P{m}
block anchors for pen-and-paper annotation.

Non-negotiables:
- Never invent facts, statistics, quotes, or sources. Every claim carries an
  inline markdown link to its source when a URL exists in the research.
- Keep provenance honest: findings from the ORIGINAL report, findings from
  the FOLLOW-UP pass, and interpretations that CHANGED must be
  distinguishable in the text (say which is which in prose — no special
  markup needed).
- No emoji. No AI-tell filler. No decorative images.

TASK — produce three files, then commit.

1. ${dir}/packet/analysis.json — the UPDATED analysis, same strict JSON shape
   as the original packet's analysis (inquiry, claims, evidence, methods,
   stakeholders, uncertainties, local_validation, followup_opportunities).
   Carry forward original claims that still stand; revise claims the new
   evidence changed (note it in the claim's "qualifications"); add new
   claims from the follow-up findings. Resolved uncertainties are removed;
   new ones are added.

2. ${dir}/packet/questions.json — same strict JSON shape as the original
   packet's questions. Only include NEW questions the new evidence genuinely
   warrants (0 to 3, each citing its analysis element in claim_ref, each
   meeting the research-specificity bar). An empty questions array is valid:
   { "questions": [] }. Do NOT include a followup-function question this
   time.

3. ${dir}/packet/packet.md — the FULL revised packet body (markdown only;
   headings, paragraphs, blockquotes, tables). Structure:
   - Title: same inquiry, marked as a revised edition (v${args.version}).
   - "What changed" — FIRST section after the title. For each follow-up
     question: the question, what the research found, and whether it
     confirms, contradicts, or extends the original packet — with sources.
     Where nothing credible was found, say so plainly.
   - Then the full packet: research question, executive summary, major
     findings (original findings that still stand PLUS the new evidence,
     integrated — with changed interpretations called out in prose),
     evidence and sources, uncertainties.
   Keep the body printable: fixed-layout US Letter document.

Finally: commit ALL files to your working branch with message
"packet(${args.pieceSlug}): revised packet v${args.version}". Do NOT open a pull request.

THE STUDENT'S FOLLOW-UP QUESTIONS:
${list}

FOLLOW-UP RESEARCH FINDINGS:
<<<FOLLOWUP_RESEARCH
${args.followupReport.trim()}
FOLLOWUP_RESEARCH>>>

ORIGINAL PACKET BODY (v${args.version - 1}, for carrying findings forward):
<<<ORIGINAL_PACKET
${args.originalPacketBody.slice(0, ORIGINAL_PACKET_PROMPT_CAP)}
ORIGINAL_PACKET>>>`;
}
