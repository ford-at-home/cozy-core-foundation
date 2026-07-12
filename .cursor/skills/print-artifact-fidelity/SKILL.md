---
name: print-artifact-fidelity
description: Change the print-for-markup view or PDF export with deterministic US Letter output — page geometry, margins, S{n}P{m} block anchors, pagination, html2pdf configuration. Use for tasks mentioning printing, PDF download, page breaks, margins, anchors, clipped or overflowing printed content, or print preview fidelity. Enforces the print.css ↔ MARKUP.md anchor sync contract.
---

# print-artifact-fidelity

## Purpose

Keep the printed artifact deterministic. The print view is the physical
interface of this product: the author prints a wide-margin US Letter copy,
marks it up with a pen using the pre-printed S{n}P{m} anchors, and a revision
agent later resolves those anchors against the same counting rule. Screen
preview, browser print, and downloaded PDF must agree with each other and with
the annotation protocol.

## Use this skill when

- The task mentions the print page, print preview, PDF download, page size,
  margins, page breaks, clipping, blank pages, or the S{n}P{m} anchors.
- Changing `src/styles/print.css`, `src/routes/_authenticated/print.$runId.tsx`,
  or `contract/references/MARKUP.md`'s anchor section.
- Printed output doesn't match the on-screen preview or the PDF.

## Do not use this skill when

- Polishing the _page around_ the preview (buttons, header, modal chrome) →
  `mobile-ui-polish`. The boundary is the iframe: content inside it is this
  skill, content outside it is ordinary responsive UI.
- Changing how annotations are _applied_ by the revision agent →
  that's `supabase/functions/_shared/prompt.ts` + `contract/` territory
  (`run-orchestration-change` for the dispatch side).

## Required context

- `src/routes/_authenticated/print.$runId.tsx` — the whole pipeline:
  fetch `agent_runs.result` → extract `post.md` → markdown-it render →
  iframe `srcDoc` with `print.css?raw` inlined → browser print / html2pdf.
- `src/styles/print.css` — `@page` (letter, `1.5in 2in 1.5in 1.5in` margins),
  typography, page-break rules, and the anchor counters under
  `body.with-anchors`.
- `contract/references/MARKUP.md` § "Pre-Printed Block Anchors" — the counting
  rule the revision agent uses. **This and print.css are one contract.**
- A completed run with a realistic multi-section `post.md` (headings,
  paragraphs, blockquote, code block, table, image) for verification.

## Invariants (do not break)

1. **US Letter, portrait.** `@page size: letter` and the html2pdf
   `jsPDF: { format: "letter" }` + `margin: [1.5, 2, 1.5, 1.5]` must stay
   consistent with each other. Never introduce A4.
2. **Anchor counting rule**: `section` increments on every heading h1–h6
   (heading labeled `S{n}` alone, `counter-set: para 0`); `para` increments on
   every non-heading block among `p, blockquote, pre, table`; list items are
   NOT counted; blockquote inner `<p>` is suppressed (one anchor per quote);
   section counter starts at 0 so the first heading is S1. Any change here
   must be mirrored in `contract/references/MARKUP.md` in the same commit —
   `scripts/check-print-contract.sh` guards the linkage markers.
3. **Iframe isolation**: print.css restyles global tags (`body`, `h1`, `p`…)
   and is only safe inside the `srcDoc` iframe. Never import it into the app
   document.
4. **PDF renders the preview iframe's body** — the preview is the source of
   truth; don't build a second render path for the PDF.
5. Keep the existing fallbacks: modal `contentWindow.print()` → new-window
   `document.write` fallback; iframe load watchdogs.

## Procedure

1. Read the three context files. Identify whether the change is (a) content
   styling, (b) page geometry, (c) anchor logic, or (d) PDF export config.
2. For anchor logic changes: write the new rule in prose first, update
   `print.css` counters AND `contract/references/MARKUP.md` together, and
   check `supabase/functions/_shared/prompt.ts` still describes the protocol
   correctly.
3. For geometry/styling: make the change in `print.css` only; verify no rule
   leaks assumptions about screen pixels — printed layout is measured in
   `in`/`pt`/`em`.
4. Build verification content: a markdown fixture exercising headings at
   multiple levels, long paragraphs spanning a page boundary, blockquote,
   `pre` block, table, and an image. Keep it as an uncommitted scratch file
   (or paste into the preview via a local run) — do not commit fixtures
   unless the task asks for one.
5. Verify on screen: preview iframe renders, anchors appear in the left
   margin (`with-anchors`), numbering matches a hand count of the fixture.
6. Verify print preview (browser print dialog, Letter, background graphics
   on): margins, page numbers, no clipped anchors (they sit at `left: -4.5em`
   inside the 2in-wide gutter — content must not overlap them).
7. Verify the downloaded PDF: page size is 8.5×11in, page count is stable and
   expected for the fixture, no blank trailing page, no element crosses the
   printable boundary, headings don't strand at page bottoms
   (`page-break-after: avoid`).
8. Stop when fidelity is verified. Do not "improve" typography, add features
   to the print page, or change the annotation protocol beyond the task.

## Validation

- [ ] `npm run lint && npm run typecheck && npm run build`
- [ ] `bash scripts/check-print-contract.sh` (anchor sync markers present in
      both files)
- [ ] Fixture hand-count matches rendered anchors (state the fixture used and
      the expected sequence, e.g. `S1, S1P1, S1P2, S2, S2P1…`).
- [ ] PDF opened and checked: page dimensions 8.5×11in, expected page count,
      no clipping, no blank trailing page. If the environment cannot run a
      browser, say so explicitly and list this as a required manual check —
      do not claim PDF verification you did not perform.

For independent review, hand the diff to the `print-layout-reviewer` subagent
(`.cursor/agents/print-layout-reviewer.md`).

## Failure modes

- Assuming A4 — everything here is US Letter.
- Editing the anchor counters in `print.css` without updating
  `contract/references/MARKUP.md` (or vice versa) — silently breaks the
  revision agent's annotation resolution.
- Using `counter-reset` instead of `counter-set` on headings — this exact bug
  existed before (paragraph numbering continued across sections); the comment
  in `print.css` explains why.
- Measuring printed layout in screen pixels; the preview iframe's on-screen
  size says nothing about page fit.
- Importing print.css globally "to fix the preview" — it will restyle the
  whole app.
- Letting html2pdf config drift from `@page` (different margins/format
  between browser print and PDF download).
- Counting list items as anchored blocks (deliberately excluded to avoid
  bullet conflicts).
- Testing only with a short document that never crosses a page boundary.

## Output contract

- Files changed; whether MARKUP.md and print.css both changed (or why not).
- The fixture used and the anchor sequence verified.
- Print/PDF checks performed, with page count and dimensions; screenshots or
  the generated PDF attached when possible.
- Checks that could not be performed in the environment, listed as required
  manual actions.

## References

- `contract/README.md` (the sync rule is documented there too)
- `docs/ARCHITECTURE.md` → Print and PDF
