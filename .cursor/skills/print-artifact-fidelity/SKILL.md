---
name: print-artifact-fidelity
description: Change the print-for-markup pipeline with deterministic US Letter output — page geometry, margins, S{n}P{m} block anchors, pagination, the print-document builder, the fidelity test harness. Use for tasks mentioning printing, PDF output, page breaks, margins, anchors, clipped or overflowing printed content, or print preview fidelity. Enforces the print.css ↔ MARKUP.md anchor sync contract.
---

# print-artifact-fidelity

## Purpose

Keep the printed artifact deterministic. The print view is the physical
interface of this product: the author prints a wide-margin US Letter copy,
marks it up with a pen using the pre-printed S{n}P{m} anchors, and a revision
agent later resolves those anchors against the same counting rule. Preview,
Save-as-PDF, and paper all share one renderer — the browser's paged-media
engine — and must agree with the annotation protocol.

## Use this skill when

- The task mentions the print page, print preview, PDF output, page size,
  margins, page breaks, clipping, blank pages, or the S{n}P{m} anchors.
- Changing `src/styles/print.css`, `src/lib/print-document.ts`,
  `src/lib/markdown.ts`, `src/routes/_authenticated/print.$runId.tsx`,
  `tests/print-*.test.ts`, `tests/anchor-reference.ts`, or
  `contract/references/MARKUP.md`'s anchor section.
- Printed output doesn't match the on-screen preview.

## Do not use this skill when

- Polishing the _page around_ the preview (buttons, header, modal chrome) →
  `mobile-ui-polish`. The boundary is the iframe: content inside it is this
  skill, content outside it is ordinary responsive UI.
- Changing how annotations are _applied_ by the revision agent →
  that's `supabase/functions/_shared/prompt.ts` + `contract/` territory
  (`run-orchestration-change` for the dispatch side).

## Billing boundary (how credits relate to printing)

Credits attach to **generation**, never to this pipeline. The billable
boundary is run dispatch (a hold is reserved before dispatch and settled when
the run completes — see `billing-and-credits`). Viewing, printing, re-printing,
or Save-as-PDF of an existing artifact is free and involves no edge function:
the print route reads the already-completed run's `agent_runs.result` and
renders it entirely client-side. Regenerating content (resynth/revise/ready)
is a **new run** and does cost a credit — but that flow lives outside this
skill. If a task would make printing itself billable or gate the print route
on balance, that is a product change: stop and apply `billing-and-credits` +
`run-orchestration-change` alongside this skill, and confirm scope first.

## Required context

- `src/lib/print-document.ts` — `buildPrintDocument`: markdown → HTML
  (via `src/lib/markdown.ts`) → self-contained document with `print.css?raw`
  inlined, fonts embedded as data URIs (Source Serif 4 + Source Code Pro),
  and a per-document running header. `buildPacketPrintDocument` (same file)
  wraps the same renderer for research packets — question blocks, ruled
  response areas, follow-up section — using `div`/`span` furniture so it
  consumes zero S{n}P{m} anchors. Both `packet` and `followup_research`
  runs print through it (`tests/packet-document.test.ts`).
- `src/routes/_authenticated/print.$runId.tsx` — renders that document in an
  isolated iframe via `srcDoc`; print and Save-as-PDF both go through the
  browser's native print dialog. There is **no client PDF library**.
- `src/styles/print.css` — `@page` geometry, typography, page-break rules,
  and the anchor counters under `body.with-anchors`.
- `contract/references/MARKUP.md` § "Pre-Printed Block Anchors" — the counting
  rule the revision agent uses. **This and print.css are one contract.**
- The fidelity harness: `tests/print-fidelity.test.ts` (real Chromium via
  playwright; PDFs land in `test-artifacts/print/`),
  `tests/anchor-reference.ts` (the reference anchor walker),
  `tests/markdown.test.ts`, `tests/print-document.test.ts`, fixtures in
  `tests/fixtures/`.

## Invariants (do not break)

1. **US Letter, portrait.** `@page { size: letter }`. Never introduce A4.
2. **Split left margin.** `@page` margins are `1.5in 2in 1.5in 0.5in` plus 1in
   body padding in print: print engines clip anything painted into the @page
   margin area, so the anchors must live inside the page content box while the
   text column still starts 1.5in from the paper edge. Don't "simplify" this
   back to a plain 1.5in page margin — the anchors disappear from PDF/paper.
3. **Margin boxes double as footer suppression.** The `@bottom-center` folio
   and `@bottom-right` attribution ("hardcopy.tools") also suppress the
   browser's own URL/page-number footers on those edges — removing one
   reintroduces browser chrome on paper. Brand strings come from
   `src/config/brand.ts` where they're set per document
   (`print-document.ts`), not hardcoded.
4. **Anchor counting rule**: `section` increments on every heading h1–h6
   (heading labeled `S{n}` alone, `counter-set: para 0`); `para` increments on
   addressable non-heading blocks; list items (and anything inside them),
   blockquote inners, image-only paragraphs are NOT counted; section counter
   starts at 0 so the first heading is S1. Any change here must be mirrored in
   `contract/references/MARKUP.md` AND `tests/anchor-reference.ts` in the same
   commit — `scripts/check-print-contract.sh` guards the markers,
   `tests/print-fidelity.test.ts` proves rendered anchors match the reference
   walker.
5. **One renderer.** Preview, Save-as-PDF, and paper all come from the same
   paged-media engine via the iframe document. Never add a DOM-screenshot PDF
   path (html2pdf/html2canvas were removed deliberately).
6. **Embedded fonts.** Fonts ship as data URIs because font metrics drive line
   breaks and line breaks drive pagination; OS-fallback fonts would paginate
   differently per machine.
7. **Iframe isolation**: print.css restyles global tags and is only safe
   inlined into the `srcDoc` document. Never import it into the app document.
8. Keep the existing fallbacks: modal `contentWindow.print()` → new-window
   `document.write` fallback; iframe load watchdogs.

## Procedure

1. Read the context files. Identify whether the change is (a) content
   styling, (b) page geometry, (c) anchor logic, (d) the document builder, or
   (e) the test harness itself.
2. For anchor logic changes: write the new rule in prose first, then update
   all three implementations together — `print.css` counters,
   `contract/references/MARKUP.md`, and `tests/anchor-reference.ts` — and
   check `supabase/functions/_shared/prompt.ts` still describes the protocol
   correctly.
3. For geometry/styling: change `print.css` only; measure in `in`/`pt`/`em`,
   never screen pixels. Respect the split-margin note (invariant 2).
4. For builder changes: keep the document self-contained (inline CSS, data-URI
   fonts, no network fetches at print time).
5. Extend fixtures when the change concerns content the existing fixtures
   don't exercise (`tests/fixtures/representative.md`, `edge-cases.md`,
   `no-headings.md`, `generators.ts`).
6. Run the fidelity suite and inspect the generated PDFs in
   `test-artifacts/print/` for the affected fixtures: page count stable, no
   clipped anchors, no blank trailing page, headings not stranded at page
   bottoms.
7. Stop when fidelity is verified. Do not "improve" typography, add features
   to the print page, or change the annotation protocol beyond the task.

## Validation

- [ ] `npm run lint && npm run typecheck && npm run build`
- [ ] `bash scripts/check-print-contract.sh` (geometry + anchor sync markers)
- [ ] `npm test` — includes `tests/print-fidelity.test.ts`, which needs
      Chromium (`npx playwright install chromium` once per environment). This
      is the authoritative check: rendered anchors vs. the reference walker,
      PDF page furniture, pagination behavior.
- [ ] Visual pass over the regenerated PDFs in `test-artifacts/print/` for
      the fixtures your change affects; attach or describe them in the report.

For independent review, hand the diff to the `print-layout-reviewer` subagent
(`.cursor/agents/print-layout-reviewer.md`).

## Failure modes

- Assuming A4 — everything here is US Letter.
- Changing the anchor counters in `print.css` without updating
  `contract/references/MARKUP.md` and `tests/anchor-reference.ts` — silently
  breaks the revision agent's annotation resolution (the fidelity test will
  catch the walker mismatch; the contract file it cannot check for you).
- Using `counter-reset` instead of `counter-set` on headings — this exact bug
  existed before (paragraph numbering continued across sections); the comment
  in `print.css` explains why.
- Collapsing the split left margin into `@page` — anchors get clipped out of
  the PDF and paper output while looking fine in the on-screen preview.
- Reintroducing a client-side PDF library; the DOM-screenshot approach was
  removed because it couldn't match the paged-media output.
- Loading fonts from the network or OS instead of the embedded data URIs —
  pagination becomes machine-dependent.
- Importing print.css globally "to fix the preview" — it will restyle the
  whole app.
- Testing only with a short document that never crosses a page boundary; use
  the `long-document` / `large-table` generators.

## Output contract

- Files changed; whether print.css, MARKUP.md, and anchor-reference.ts moved
  together (or why not).
- Fixtures exercised and the fidelity-test results.
- PDFs inspected in `test-artifacts/print/` (which ones, what you checked).
- Checks that could not be performed in the environment, listed as required
  manual actions.

## References

- `contract/README.md` (the sync rule is documented there too)
- `docs/ARCHITECTURE.md` → Print and PDF
- `vitest.config.ts` (why `css: true` and the long test timeouts)
