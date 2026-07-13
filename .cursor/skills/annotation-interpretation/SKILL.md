---
name: annotation-interpretation
description: Interpret scanned or photographed pages of the printed Hardcopy Draft artifacts — locate marks with S{n}P{m} anchors and Q{n} question ids, classify symbols/dials/directives per MARKUP.md, decide what is an edit vs. a note vs. noise, and report ambiguity instead of guessing. Use for tasks about reading marked-up pages, handwriting recognition prompts, resolving annotations to blocks, or applying pen edits to a document.
---

# annotation-interpretation

## Purpose

Turn a photographed, pen-marked page of a printed artifact into structured,
attributable edit intents — without inventing anything. The printed page is
the product's input device: everything on it was designed so that a machine
reading a grayscale photo can reconstruct *which document, which page, which
block, what intent*. This skill is the reading protocol.

## Use this skill when

- The task involves reading returned pages: the recognition prompt
  (`supabase/functions/_shared/recognition.ts`), the return flow
  (`analyze-returned-page`, `submit-dictation`, `verify-student-responses`),
  or any agent that must interpret marks on a scan.
- Changing how annotations resolve to document blocks, or how a revision
  agent applies pen edits.
- Debugging "the mark was applied to the wrong paragraph" class of issues.

## Do not use this skill when

- Changing how the page is *printed* (legend, anchors, geometry) →
  `print-artifact-fidelity`. This skill consumes what that one produces.
- Changing run dispatch or persistence around the return flow →
  `run-orchestration-change`.

## Required context

- `contract/references/MARKUP.md` — **the source of truth** for every mark:
  the six symbols, dials, directives, handles, highlighter, voice grammar,
  and the S{n}P{m} counting rule. Read it fully; do not work from memory.
- `src/lib/print-document.ts` + `src/styles/print.css` — what is actually
  printed where (see "Page anatomy" below).
- `supabase/functions/_shared/recognition.ts` — the recognition prompt and
  the structured block schema (`annotation_type`, `question_position`,
  `anchor`, confidences) with its no-fabrication parser.
- `docs/research-workflow/04-return-and-recognition.md` — the product spec
  for returns and verification.

## Page anatomy (what is print, what is pen)

Everything below is machine-printed and must never be transcribed as user
input:

| Printed element        | Where                            | Use it for                                    |
| ---------------------- | -------------------------------- | --------------------------------------------- |
| Document ref           | top-right, every page            | attribution: `draft {runId8}` for longform, `packet {packetId8} · v{n}` for packets |
| Running title          | top-center, pages ≥ 2            | confirming pages belong together               |
| `S{n}P{m}` anchors     | left margin, beside each block   | locating marks (8pt, gray, monospace)          |
| Markup key (legend)    | top of page 1                    | context only — pen strokes on it are noise     |
| Symbol reminder strip  | bottom-left, pages ≥ 2           | context only                                   |
| Folio `Page n of m`    | bottom-center                    | page ordering and completeness                 |
| `hardcopy.tools`       | bottom-right                     | nothing (attribution)                          |
| Packet header + blanks | page 1 of packets                | NAME/COURSE/DATE handwriting lands here        |
| `Q{n}` / `Q{n}.{m}`    | question blocks (packets)        | linking responses to questions                 |

Pen input is everything else: writing in ruled lines and boxes, margin
symbols, dials, directives, circled numbers (handles), underlines, circles,
arrows, strikethroughs, highlighter, and inline insertions with carets.

## Identifier formats

- `S{n}` — a heading (section n). `S{n}P{m}` — the m-th addressable block in
  section n. The counting rule (what counts as a block) is defined in
  MARKUP.md § "Pre-Printed Block Anchors" and implemented in `print.css`;
  never re-derive it from intuition. Anchors are continuous across pages.
- `Q{n}` (and `Q{n}.{m}` for follow-up sub-questions, `F.{m}` for default
  follow-up areas) — packet questions. A response belongs to the question
  whose printed writing area it occupies.
- `① ② ③` — hand-numbered handles, continuous across the whole document,
  assigned by the user, referenced from voice as "mark three".
- Document ref (top-right) + folio → every photo of a page is attributable
  to one document, version, and page even when photos arrive out of order.

## Interpretation precedence

When resolving what a voice segment or a mark refers to (MARKUP.md
§ "Reference patterns"), resolve in this order:

1. **Block anchor** (`S4P3` cited in voice or written next to the mark)
2. **Hand-numbered handle** (`①`)
3. **Symbol class** ("all the strikethroughs")
4. **Content match** ("the bit about ownership")

If several candidates match, pick the best fuzzy match AND flag it in the
change log. If none match, ask one question — never apply a guess silently.

## Handling each mark type

- **✓ keep** — no change; protects the block from other global operations.
- **✗ cut / strikethrough** — delete the struck scope exactly.
- **~ rework** — needs voice for the "how"; without voice, surface as
  unresolved rather than improvising a rewrite.
- **★ expand** — needs voice for the "with what"; same rule.
- **→ move** — needs a destination (arrow endpoint or voice); an arrow whose
  endpoint is illegible is unresolved.
- **? weak** — not an edit; a challenge to surface back to the user.
- **Dials (WC/REG/VOI/RH, signed)** — apply to the adjacent block at the
  signed strength; report the interpretation in the change log.
- **Directives (VIZ, SLOP, TIGHT, …)** — named operations; voice may carry a
  parameter. `KSP` is special: not vendored — record in `notes/unresolved.md`
  instead of restructuring from memory.
- **Highlighter** — "use as-is": preserve verbatim (Edit Mode) or pull into
  the new piece (Compose Mode).
- **Underline/circle** — scope-narrowing devices: they bind the attached
  symbol/dial to the underlined words instead of the whole block.
- **Inline replacement** — struck words + new words above/nearby joined by a
  line or caret: replace exactly what was struck with exactly what was
  written; the written words are the content, no paraphrase.
- **X-ed out notes** — struck through wholesale by the user: ignore entirely.

## When NOT to guess (hard rules)

- Never invent, autocomplete, or "clean up" handwriting. An unreadable word
  is omitted; an unreadable block is omitted (the schema in `recognition.ts`
  drops empty blocks by design).
- A mark that visibly attaches to nothing is an **Unresolved** item, not an
  edit.
- An unknown symbol (not in the legend) is a question for the user, never a
  best-effort interpretation.
- A ~ / ★ / → without its required voice content is surfaced, not
  improvised.
- Low transcription confidence (< 0.5, `LOW_CONFIDENCE_THRESHOLD`) requires
  an explicit user verdict at verification; do not treat it as settled input.
- If page quality blocks reliable reading (blur, glare, crop, skew), report
  `quality.ok=false` with a specific, actionable retake message instead of
  producing degraded blocks.

## Expected structured output

Recognition output follows `PageRecognition` in `recognition.ts`: a
page-level quality verdict plus blocks of
`{ text, confidence, annotation_type, location, question_position, anchor,
interpretation_confidence }`. Interpretation/application output (revision
agents) follows MARKUP.md's worked examples: the edited text plus a "What I
Changed" change log naming every mark, its resolution, and every
interpretive choice made — and an explicit "Unresolved" list when anything
was skipped. Ambiguity is reported in the output, never silently absorbed.

## Pre-apply validation checks

Before applying interpreted edits to a document:

- [ ] Every applied mark resolves to an anchor/handle/question that exists
      in the printed document (the anchor walker in
      `tests/anchor-reference.ts` defines what exists).
- [ ] The document ref and page numbers of the photos match one document and
      form a plausible page set (gaps are reported, not assumed blank).
- [ ] Verbatim content (highlighter, replacement text, verified responses)
      survives byte-for-byte — no paraphrase.
- [ ] Every ~ / ★ / → either has voice content or appears under Unresolved.
- [ ] The change log accounts for every mark found on the page (applied,
      skipped-with-reason, or unresolved).

## Worked example

Photo shows, beside printed anchor `S2P1`: a `~` in the margin, "reorgs blur
ownership" written above a struck phrase "ownership becomes ambiguous", and
`WC–` beside the block. Voice memo: "S2P1: keep it punchy."

Correct interpretation:

- `S2P1` located via the printed anchor (precedence 1).
- The strikethrough + written words are an inline replacement: substitute
  exactly "reorgs blur ownership".
- The `~` is satisfied by the voice content ("keep it punchy") — rework the
  rest of the block in that direction.
- `WC–` = plainer word choice on the whole block, single strength; report
  the interpretation.
- Change log lists all three marks; nothing unresolved.

If the same page had a stray `→` pointing off the page edge, it would be
reported under Unresolved ("→ on S2P1 has no visible destination") and NOT
applied.

## Failure modes

- Transcribing printed packet text (questions, legend, guidance boxes) as if
  the student wrote it — the recognition prompt carries the question list
  precisely so print can be separated from pen.
- Treating reading tick-marks as ✓ "keep verbatim" edits when they cluster
  meaninglessly — if every block on a page is ticked, ask.
- Applying a dial or directive to the *nearest* block when it actually sits
  between two blocks — that is an ambiguity to flag, not a proximity contest.
- Re-deriving the anchor counting rule from intuition instead of MARKUP.md
  (list items and blockquote inners do NOT count).
- Silently absorbing ambiguity: every fuzzy resolution belongs in the change
  log; every non-resolution belongs in Unresolved.

## Output contract

- What was read (documents, versions, pages) and how attribution was
  established.
- Blocks/marks recognized, with classifications and confidences.
- Resolutions applied, with the precedence step that resolved each.
- Unresolved items and the single clarifying question each would need.

## References

- `contract/references/MARKUP.md` (protocol source of truth)
- `docs/research-workflow/04-return-and-recognition.md`
- `.cursor/skills/print-artifact-fidelity/SKILL.md` (the producing side)
