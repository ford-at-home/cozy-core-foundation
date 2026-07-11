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
}

export interface RevisionPromptInput {
  pieceSlug: string;
  draftPath: string; // e.g. pieces/<slug>/draft.md
  transcript: string; // typed (later dictated) shorthand annotations
  styleText: string;
}

const CONTRACT_PREAMBLE = `You are running the synthesize contract of this repository.

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
  its source when a URL exists in the research.
- No emoji unless the source used them. No AI-tell filler.
`;

export function buildComposePrompt(input: ComposePromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  return `${CONTRACT_PREAMBLE}
TASK: compose a proposal for a new long-form piece.

Steps:
1. Write the research provided below, verbatim, to ${dir}/research/research.md.
2. Author ${dir}/brief.md per contract/references/BRIEF.template.md. For the
   Voice field write "inline (from profile)" and treat the VOICE text below as
   that voice. Persona, throughline, and stakes come from the research and GOAL.
3. Synthesize ${dir}/proposal.md — the piece itself, brief-faithful, in the
   inline voice, with inline hyperlinked citations. This is the artifact peers
   will read and comment on: it must stand alone.
4. Write ${dir}/notes/to-research.md, ${dir}/notes/tighten.md, and
   ${dir}/notes/unresolved.md per the contract (always, even if empty).
5. Commit all files to your working branch with message
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
`;
}

export function buildRevisionPrompt(input: RevisionPromptInput): string {
  const dir = `pieces/${input.pieceSlug}`;
  return `${CONTRACT_PREAMBLE}
Also read contract/references/MARKUP.md — the pen-and-paper markup protocol.
The ANNOTATIONS below are the author's dictated shorthand notes from a printed
copy of ${input.draftPath}. Block anchors (S{n}P{m}) follow MARKUP.md's counting
rule exactly.

TASK: apply the annotations and produce the final, publishable version.

Steps:
1. Read ${input.draftPath}. Resolve every annotation per MARKUP.md's resolution
   order (block anchor -> hand-numbered handle -> symbol class -> content).
2. Write ${dir}/final.md — the finished piece in the inline voice, every
   citation inline-hyperlinked. Where a VISUALIZE directive lands, insert a
   fenced mermaid diagram or a bracketed [Sketch: ...] placeholder per the
   annotation's parameter.
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

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "piece";
}
