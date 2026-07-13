// Prompt builders for cloud agent runs. The agent clones THIS repo; the
// synthesize contract is vendored at contract/ (see contract/README.md for
// the three overrides: inline voice, inline channel, pieces/ output paths).
//
// Voice is the caller's profile style_text, injected inline. It is user
// content: keep it out of logs and out of the run row's input jsonb.

export interface ComposePromptInput {
  pieceSlug: string;
  research: string;
  goal: string | null;
  styleText: string;
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
  attachments?: PromptAttachment[];
}

export interface PromptAttachment {
  name: string;
  contentType?: string;
  /** Inlined text content (for text-like files). */
  text?: string;
  /** Signed URL the agent can fetch (for binary/large files). */
  url?: string;
  /** Size in bytes (informational). */
  size?: number;
  /** Set when text was truncated to fit the prompt budget. */
  truncated?: boolean;
}

export interface RevisionPromptInput {
  pieceSlug: string;
  draftPath: string; // e.g. pieces/<slug>/draft.md
  transcript: string; // typed (later dictated) shorthand annotations
  styleText: string;
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
}

function buildPreamble(opts: {
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
}): string {
  const imgBlock =
    opts.imageEndpoint && opts.imageToken
      ? renderImageRule(opts.imageEndpoint, opts.imageToken, opts.imageStyle ?? "")
      : LEGACY_VISUALS_RULE;
  return `You are running the synthesize contract of this repository.

Read first, in order:
1. contract/SKILL.md            — the synthesize contract. Follow it.
2. contract/references/BRIEF.template.md — the brief shape you must author.
3. contract/README.md           — three overrides that adapt the contract to this system.

Contract overrides in effect for this run (they take precedence over SKILL.md):
- Voice does NOT resolve from ~/.me/voices/. The voice is provided INLINE below
  under "VOICE". If the inline voice is empty, STOP and fail the run — do not
  substitute a default voice.
- Channels do NOT resolve from ~/.me/channels/. Use a single "longform" channel:
  publishable long-form prose, inline markdown hyperlinks for every citation.
- Outputs do NOT go to .output/. Write them to the piece directory named below.

Non-negotiables (from the contract):
- Never invent facts, statistics, quotes, or sources. Where the research is
  thin, write [Source needed: ...] and list it in notes/to-research.md.
- Every claim that came from the research carries an inline markdown link to
  its source when a URL exists in the research. Preserve the research's own
  citations; never strip a URL the research provided.
- No emoji unless the source used them. No AI-tell filler.

${imgBlock}
`;
}

const LEGACY_VISUALS_RULE = `VISUALS RULE (applies whenever you produce a diagram or image):
- The piece is rendered by a plain markdown renderer and printed to paper.
  Do NOT emit mermaid/graphviz code fences or raw HTML in the deliverable —
  they will show up as literal code.
- Instead, render each diagram to an SVG yourself (e.g.
  \`npx -y @mermaid-js/mermaid-cli -i diagram.mmd -o out.svg\`), commit it to
  pieces/<slug>/assets/, and after committing reference it as a standard
  markdown image with the IMMUTABLE commit-pinned URL:
  ![<alt text>](https://raw.githubusercontent.com/ford-at-home/cozy-core-foundation/<commit sha of your commit>/pieces/<slug>/assets/<file>.svg)
  (Get the sha with \`git rev-parse HEAD\` after the commit that adds the
  asset; commit-pinned URLs keep working after the branch is merged and
  deleted.)
- If you cannot produce the SVG, insert a bracketed placeholder
  ([Diagram: ...] / [Sketch: ...]) and record it in notes/unresolved.md —
  never silently drop a requested visual.`;

function renderImageRule(endpoint: string, token: string, style: string): string {
  const styleBlock = style.trim()
    ? `Author's IMAGE STYLE (apply to every generated image):\n<<<IMAGE_STYLE\n${style.trim()}\nIMAGE_STYLE>>>`
    : `The author has NOT set an image style. Skip generating images and use bracketed placeholders instead ([Image: ...]) recorded in notes/unresolved.md.`;
  return `VISUALS RULE — the piece gets real generated images, not SVGs.

${styleBlock}

For each place the piece benefits from a visual (cover image at the top of the
piece is required when IMAGE_STYLE is set; section illustrations are optional
but encouraged where they earn their place), generate a raster image and
commit it to pieces/<slug>/assets/. Do NOT emit mermaid/graphviz code fences,
HTML, or SVG for illustrative visuals — only real images.

How to generate an image (call this endpoint from the sandbox):
  curl -sS -X POST "${endpoint}" \\
    -H "authorization: Bearer ${token}" \\
    -H "content-type: application/json" \\
    -d '{"prompt": "<concrete visual description that inlines the IMAGE_STYLE above>", "filename": "<slug>-cover.png"}' \\
    --output pieces/<slug>/assets/<slug>-cover.png

Rules:
- The prompt you send MUST inline the IMAGE_STYLE verbatim so every image
  looks like it belongs to the same author. Add the specific subject after.
- Use descriptive filenames: <slug>-cover.png, <slug>-01-<topic>.png, etc.
- Verify the response is a PNG (\`file pieces/<slug>/assets/<name>.png\`
  reports "PNG image data"). If the response is JSON, it is an error —
  read the message, adjust the prompt, and retry once.
- Commit the images to your working branch, then reference them in the
  markdown with the IMMUTABLE commit-pinned URL:
  ![<alt text>](https://raw.githubusercontent.com/ford-at-home/cozy-core-foundation/<commit sha>/pieces/<slug>/assets/<file>.png)
  (Get the sha with \`git rev-parse HEAD\` after the commit that adds the asset.)
- Real diagrams (flowcharts, data plots) may still be SVG via the legacy path,
  but prefer a generated image with a hand-drawn feel where possible.
- If the endpoint fails twice in a row, insert a bracketed placeholder
  ([Image: ...]) and record it in notes/unresolved.md. Never silently drop
  a visual.`;
}

export function buildComposePrompt(input: ComposePromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  const attachmentsBlock = renderAttachments(input.attachments, dir);
  const preamble = buildPreamble({
    imageStyle: input.imageStyle,
    imageEndpoint: input.imageEndpoint,
    imageToken: input.imageToken,
  });
  return `${preamble}
TASK: compose a proposal for a new long-form piece.

Steps:
1. Write the research provided below, verbatim, to ${dir}/research/research.md.
2. If any ATTACHMENTS are provided below, treat them as additional research
   input. For each inline-text attachment, write it verbatim to
   ${dir}/research/attachments/<safe-name>. For each URL attachment, fetch it
   (curl/wget) and save the raw bytes to ${dir}/research/attachments/<safe-name>;
   if the file is text-like, additionally extract its readable content into
   ${dir}/research/attachments/<safe-name>.txt. If a fetch fails, record the
   URL and error in ${dir}/notes/unresolved.md and continue.
3. Author ${dir}/brief.md per contract/references/BRIEF.template.md. For the
   Voice field write "inline (from profile)" and treat the VOICE text below as
   that voice. Persona, throughline, and stakes come from the research and GOAL.
4. Synthesize ${dir}/proposal.md — the piece itself, brief-faithful, in the
   inline voice, with inline hyperlinked citations. This is the artifact peers
   will read and comment on: it must stand alone.
5. Write ${dir}/notes/to-research.md, ${dir}/notes/tighten.md, and
   ${dir}/notes/unresolved.md per the contract (always, even if empty).
6. Commit all files to your working branch with message
   "piece(${input.pieceSlug}): proposal". Do NOT open a pull request.

GOAL (optional steer for persona + throughline):
${input.goal?.trim() || "(none provided — derive persona and throughline from the research)"}

VOICE (inline; this is the brief's Voice section):
<<<VOICE
${input.styleText.trim()}
VOICE>>>

RESEARCH:
<<<RESEARCH
${input.research.trim()}
RESEARCH>>>
${attachmentsBlock}`;
}

function renderAttachments(atts: PromptAttachment[] | undefined, dir: string): string {
  if (!atts || atts.length === 0) return "";
  const parts: string[] = [
    "",
    "ATTACHMENTS (additional research input; save each to " + dir + "/research/attachments/):",
  ];
  for (const a of atts) {
    parts.push("");
    parts.push(
      `--- ATTACHMENT: ${a.name}` +
        (a.contentType ? ` (${a.contentType})` : "") +
        (typeof a.size === "number" ? ` [${a.size} bytes]` : ""),
    );
    if (a.url) {
      parts.push(`FETCH_URL: ${a.url}`);
      parts.push("(Signed URL; expires. Fetch immediately and save the bytes.)");
    }
    if (typeof a.text === "string") {
      parts.push(a.truncated ? "INLINE_TEXT (truncated to fit prompt budget):" : "INLINE_TEXT:");
      parts.push("<<<FILE");
      parts.push(a.text);
      parts.push("FILE>>>");
    }
  }
  return parts.join("\n") + "\n";
}

export function buildRevisionPrompt(input: RevisionPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  const preamble = buildPreamble({
    imageStyle: input.imageStyle,
    imageEndpoint: input.imageEndpoint,
    imageToken: input.imageToken,
  });
  return `${preamble}
Also read contract/references/MARKUP.md — the pen-and-paper markup protocol.
The ANNOTATIONS below are the author's dictated shorthand notes from a printed
copy of ${input.draftPath}. Block anchors (S{n}P{m}) follow MARKUP.md's counting
rule exactly.

TASK: apply the annotations and produce the final, publishable version.

Steps:
1. Read ${input.draftPath}. Resolve every annotation per MARKUP.md's resolution
   order (block anchor -> hand-numbered handle -> symbol class -> content).
2. Write ${dir}/final.md — the finished piece in the inline voice, every
   citation inline-hyperlinked (carry every source link from the draft; add
   the ones the annotations request). Where a VISUALIZE directive lands,
   produce the visual per the VISUALS RULE above, honoring the annotation's
   parameter (diagram / infographic / sketch). Also inject visuals where the
   piece clearly benefits (per the voice's visual preferences), not only
   where directives land.
3. Update ${dir}/notes/unresolved.md with any annotation that could not be
   resolved (never silently drop one) and ${dir}/notes/tighten.md per the contract.
4. Commit to your working branch with message
   "piece(${input.pieceSlug}): final from annotations". Do NOT open a pull
   request; the control plane handles that.

VOICE (inline):
<<<VOICE
${input.styleText.trim()}
VOICE>>>

ANNOTATIONS (typed transcript of hand-marked notes):
<<<ANNOTATIONS
${input.transcript.trim()}
ANNOTATIONS>>>
`;
}

export interface ResynthPromptInput extends ComposePromptInput {
  feedback: string | null;
}

/** Second (third, ...) attempt at the proposal, steered by owner feedback. */
export function buildResynthPrompt(input: ResynthPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  return (
    buildComposePrompt(input) +
    `
NOTE: this is a RE-SYNTHESIS. A prior attempt exists at ${dir}/proposal.md on
your base branch. Read it, then produce a fresh attempt (overwrite the file) —
do not lightly edit the old one. Address this feedback:
<<<FEEDBACK
${input.feedback?.trim() || "(none provided — take a substantially different angle)"}
FEEDBACK>>>
`
  );
}

export interface DraftPromptInput {
  pieceSlug: string;
  styleText: string;
  feedback: string | null;
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
}

/** "Ready": turn the accepted proposal into the final draft, PR'd for approval. */
export function buildDraftPrompt(input: DraftPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  const preamble = buildPreamble({
    imageStyle: input.imageStyle,
    imageEndpoint: input.imageEndpoint,
    imageToken: input.imageToken,
  });
  return `${preamble}
TASK: the proposal has been accepted. Produce the final draft.

Steps:
1. Read ${dir}/brief.md, ${dir}/proposal.md, and the notes in ${dir}/notes/.
2. Write ${dir}/draft.md — the finished piece: brief-faithful, in the inline
   voice, every citation inline-hyperlinked, ready to print and mark up.
   Resolve the open questions in notes/tighten.md where the proposal and
   feedback give you the answer; carry the rest into an updated notes/tighten.md.
3. Commit with message "piece(${input.pieceSlug}): draft". A pull request WILL
   be opened for this run automatically — that is expected.

FEEDBACK from the owner (may be empty):
<<<FEEDBACK
${input.feedback?.trim() || "(none)"}
FEEDBACK>>>

VOICE (inline):
<<<VOICE
${input.styleText.trim()}
VOICE>>>
`;
}

// -----------------------------------------------------------------------------
// Research packet (college research workflow — docs/research-workflow/).
// The packet agent analyzes the research BEFORE writing questions, then
// generates research-specific Socratic questions, then the packet body.
// Questions live in questions.json (not packet.md) so the review screen can
// edit/lock/add them and the print layer renders them with writing space.
// -----------------------------------------------------------------------------

export interface PacketPromptInput {
  pieceSlug: string;
  research: string;
  goal: string | null;
  imageStyle?: string;
  imageEndpoint?: string;
  imageToken?: string;
  attachments?: PromptAttachment[];
}

export function buildPacketPrompt(input: PacketPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  const attachmentsBlock = renderAttachments(input.attachments, dir);
  const imgBlock =
    input.imageEndpoint && input.imageToken && (input.imageStyle ?? "").trim()
      ? renderImageRule(input.imageEndpoint, input.imageToken, input.imageStyle ?? "")
      : LEGACY_VISUALS_RULE;
  return `You are preparing a RESEARCH PACKET for a college student — a printable
US Letter document the student will read away from the screen, annotate by
hand, and answer questions in by hand. You are a research-methodology
specialist and Socratic curriculum designer, not a prose stylist. This run
does NOT follow contract/SKILL.md; follow THIS prompt exactly.

Read contract/references/MARKUP.md first — the pen-and-paper annotation
protocol printed in the packet's legend. The packet body will carry S{n}P{m}
block anchors, so students annotate findings by anchor.

Non-negotiables:
- Never invent facts, statistics, quotes, or sources. Where the research is
  thin, say so plainly in the packet's uncertainties section.
- Every claim that came from the research carries an inline markdown link to
  its source when a URL exists in the research. Never strip a URL the
  research provided.
- No emoji. No AI-tell filler.

${imgBlock}

TASK: produce the packet in three phases, in this order.

Step 0 — Preserve the research. Write the research provided below, verbatim,
to ${dir}/research/research.md. If ATTACHMENTS are provided, save each per
the attachment instructions.

PHASE A — Analyze the research BEFORE writing any question.
Write ${dir}/packet/analysis.json — strict JSON (no comments, no trailing
commas) with exactly this shape:
{
  "inquiry": { "question": str, "scope": str,
    "definitions": [{"term": str, "definition": str, "disputed": bool}],
    "geography": str|null, "period": str|null,
    "populations": {"included": [str], "excluded": [str]} },
  "claims": [{ "id": "C1", "text": str,
    "strength": "strong"|"moderate"|"weak",
    "type": "descriptive"|"predictive"|"causal"|"normative"|"speculative",
    "evidence": ["E1"], "qualifications": [str], "affected": [str],
    "uncertainty": str|null }],
  "evidence": [{ "id": "E1", "kind": "primary"|"secondary"|"dataset"|"survey"|"interview"|"experiment"|"case_study"|"legal"|"historical"|"institutional_report"|"model_synthesis"|"unsupported_assertion",
    "description": str, "source": str|null, "url": str|null }],
  "methods": [{ "id": "M1", "aspect": "sampling"|"measurement"|"comparison"|"time_range"|"geography"|"causal_assumption"|"statistical"|"qualitative"|"source_selection",
    "description": str, "limitation": str|null }],
  "stakeholders": [{ "id": "K1", "who": str,
    "role": "affected"|"decision_maker"|"institution"|"community"|"profession"|"regulator"|"critic"|"beneficiary"|"cost_bearer",
    "note": str|null }],
  "uncertainties": [{ "id": "U1", "kind": "missing_data"|"corrupted_data"|"inconsistent_classification"|"selection_bias"|"measurement_error"|"confounding"|"outdated_sources"|"geographic_limit"|"weak_causal_inference"|"missing_testimony"|"conflicting_studies"|"implementation_assumption",
    "description": str, "claims": ["C1"] }],
  "local_validation": [{ "id": "L1", "activity": str, "description": str, "claims": ["C1"] }],
  "followup_opportunities": [{ "id": "F1", "question": str, "why": str,
    "evidence_needed": str, "likely_sources": [str], "answerable": bool,
    "connects_to": str }]
}
Record every MAJOR claim (typically 3–8). Be honest: evidence the research
merely asserts is kind "unsupported_assertion"; synthesis by a model is
"model_synthesis". Identify up to six followup_opportunities — real gaps a
second research pass could close with authoritative evidence.

PHASE B — Generate the tailored Socratic questions.
Write ${dir}/packet/questions.json — strict JSON:
{ "questions": [{ "position": 1,
    "function": "prior_belief"|"stakes"|"evidence_integrity"|"missing_perspective"|"ground_truth"|"expert_interrogation"|"counterargument"|"definition_framing"|"action"|"followup",
    "claim_ref": "C2",
    "prompt": str,
    "guidance": str|null,
    "response_space": "lines_3"|"lines_5"|"third_page"|"half_page"|"box" }] }

Question rules (NON-NEGOTIABLE):
- 5 to 8 questions total, balanced across different functions. EXACTLY ONE
  question has function "followup" and it is LAST. Its prompt names a
  specific established finding and a specific unresolved issue, and invites
  up to three follow-up research questions the student wants answered
  authoritatively. Set its guidance to a credibility sub-prompt like
  "What source, dataset, expert, institution, or type of evidence would make
  the answer credible?".
- EVERY question is rewritten around the actual research. It must reference
  a concrete element: a particular finding, a named source, a dataset, a
  method, a measured outcome, an affected population, an institution, a
  jurisdiction, a time period, a comparison group, an expert role, a
  stakeholder, a disputed definition, a causal claim, a missing perspective,
  a practical decision, or a local validation opportunity.
- claim_ref MUST name the analysis element (C/E/M/U/K/L id) that generated
  the question.
- Every question requires the student's judgment, experience, skepticism, or
  local action — never retrieval from the report. The AI must not be able to
  answer it from the packet alone.
- PROHIBITED as final questions (generic worksheet prompts):
  "What would prove this research wrong?",
  "What assumptions are being made?",
  "Why does this matter?",
  "Who could validate this?",
  "What evidence is missing?",
  "What follow-up research would you like?" — and any question that could be
  moved to a packet on an UNRELATED topic without meaningful changes.
- Score each question 0–2 on: research specificity; intellectual depth;
  student contribution; evidence connection; actionability; clarity.
  Regenerate any question scoring below 9 of 12.
- Choose response_space by expected answer length: lines_3 / lines_5 for
  short responses, third_page for medium reflection, half_page for detailed
  responses, box for lists or diagrams.

PHASE C — Write the packet body: ${dir}/packet/packet.md.
Markdown only (headings, paragraphs, blockquotes, tables, images). Do NOT
include the questions — the app renders them from questions.json with
handwriting space. Structure:
1. Title (# heading) naming the actual inquiry.
2. "The research question" — the inquiry, scope, key definitions, period,
   and populations, in prose.
3. "Executive summary" — what the research found, honestly qualified.
4. "Major findings" — one subsection per major claim, each carrying its
   evidence discussion and inline source links. Note claim strength and type
   where it matters (e.g. correlation vs. causation).
5. "Evidence and sources" — what kinds of evidence the report rests on,
   which sources are authoritative, which are thin.
6. "Uncertainties and competing interpretations" — the concrete
   uncertainties from your analysis, stated plainly.
Use visuals where they genuinely clarify (process diagrams, timelines,
causal maps, comparison tables, evidence hierarchies) per the VISUALS RULE.
Every visual gets a caption identifying whether it is data-driven or
conceptual, and must stay readable in grayscale print. No decorative images.
Keep the body printable: this is a fixed-layout US Letter document.

Finally: commit ALL files (research, analysis.json, questions.json,
packet.md, any assets) to your working branch with message
"packet(${input.pieceSlug}): research packet". Do NOT open a pull request.

GOAL (the student's or professor's steer, may be empty):
${input.goal?.trim() || "(none provided — derive the framing from the research)"}

RESEARCH:
<<<RESEARCH
${input.research.trim()}
RESEARCH>>>
${attachmentsBlock}`;
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "piece";
}
