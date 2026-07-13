# Artifact Quality Review

Focused review of the three generated outputs — the printable HTML artifact,
the final DOCX document, and the final PPTX presentation — with the
improvements implemented alongside it. Everything here was verified against
real rendered output (Chromium print-engine PDFs for the printable artifact;
locally generated OOXML samples rendered through headless LibreOffice for
the Office artifacts) except where explicitly marked **unverifiable from
this repo**.

Regenerating the review samples:

- Printable artifact PDFs: `npx playwright install chromium && npm test` →
  `test-artifacts/print/*.pdf` (+ a screen PNG).
- Office samples: `npm test` (specifically `tests/office-artifacts.test.ts`)
  → `test-artifacts/office/sample.docx` / `sample.pptx`. Render with
  `soffice --headless --convert-to pdf <file>` for visual QA.

---

## 1. Artifact pipeline

### Printable HTML artifact (fully in-repo)

`agent_runs.result` (markdown `post.md`) → `src/lib/markdown.ts` →
`src/lib/print-document.ts` (`buildPrintDocument` for longform drafts,
`buildPacketPrintDocument` for research packets) → one self-contained HTML
document with `src/styles/print.css` inlined (`?raw`), five font faces
embedded as data URIs, and per-document page furniture → rendered in an
isolated iframe by `src/routes/_authenticated/print.$runId.tsx` → the
browser's paged-media engine produces preview, Save-as-PDF, and paper from
the same renderer. US Letter only; the S{n}P{m} anchor counting rule is a
three-way contract between `print.css`, `contract/references/MARKUP.md`,
and `tests/anchor-reference.ts`.

### Final DOCX / PPTX (produced externally, gated in-repo)

`create-final-document-job` / `create-presentation-job` Edge Functions
reserve credits, build a prompt (`buildFinalDocxPrompt` /
`buildFinalPptxPrompt` in `supabase/functions/_shared/followup-final.ts`
— carrying the packet body, analysis, verified responses, student
contributions, follow-up summary, and voice profile), and dispatch an
external cloud agent, which generates the binary programmatically with an
OOXML library (`docx` npm / `python-docx`, `pptxgenjs` / `python-pptx`) and
commits it to its branch. On completion, `persistFinalArtifactResult`
fetches the binary, validates it with
`supabase/functions/_shared/ooxml.ts`, uploads to the private
`final-artifacts` bucket, and flips the `final_artifacts` row to `ready`
(idempotent by `run_id`; a validation failure is terminal for the run).

The only in-repo quality levers for the Office artifacts are therefore the
**prompt builders** and the **validator** — both were strengthened (§9).

---

## 2. Findings — printable HTML artifact

Baseline inspected: all five fixture PDFs plus the packet PDF in
`test-artifacts/print/` (Chromium print engine, the same engine behind
preview/Save-as-PDF/paper).

What was already strong: deterministic US Letter geometry with a 2in pen
margin; generous 1.7 leading leaves real interline writing room; anchors
form a clean right-aligned margin column; tables repeat headers across
pages; headings never strand at page bottoms; packets keep each question
block whole with its writing area; screen preview and PDF paginate
identically (embedded fonts).

| # | Problem | Evidence | Impact | Change |
|---|---------|----------|--------|--------|
| P1 | The printed legend advertised **Dials (WC/REG/VOI/RH)** that `MARKUP.md` never defined | legend in `print-document.ts` vs. MARKUP.md (no Dials section) | The user's printed instruction set and the interpreting agent's contract disagreed — dial marks on paper had no defined interpretation | Dials defined in MARKUP.md (Quick Reference + Channel 1); legend and contract agree again |
| P2 | Legend covered symbols only — no scope rule, no replacement/insertion procedure, no approval default, no "what not to draw", no example | old 5-row legend (`MARKUP_LEGEND_HTML`) | Users improvise (floating marks, reading ticks, notes-as-input), which degrades machine interpretation | Legend rewritten: 7 compact rows — Marks (with scope), Edits (replace/insert/unmarked=unchanged), Dials, Directives, Refer (anchors/handles/highlight), a worked Example, and an Avoid row |
| P3 | Symbols were only explained on page 1; page 5 of a packet gave no reminder | baseline PDFs | Mid-document annotators must flip back to page 1 | Minimal symbol strip in the `@bottom-left` margin box on every page after the first |
| P4 | Longform drafts carried **no document identifier** — a photographed page 3 was unattributable (packets already had an id on page 1 only) | `pageFurnitureCss` baseline | Scanned/photographed pages can't be reliably matched to a document/version | `draft {runId8}` (longform) / `packet {packetId8} · v{n}` (packets) printed in the `@top-right` margin box on **every** page |
| P5 | New bottom/top margin boxes initially collided with the folio and running header (wrapping "Page 2 / of 4") | intermediate render during this work | Broken page furniture | `white-space: nowrap` on all margin boxes; reminder at 6.5pt; long titles trimmed to a 44-char budget with an ellipsis |
| P6 | Legend glyphs (✓ ✗ ★ → ① …) are not in the embedded font subsets | `pdffonts`: DejaVuSans/DejaVuSansMono fallback subsets embedded in the PDFs | Cross-OS fallback metrics could shift legend wrap points by a line (not a regression — pre-existing) | Verified stable in the fidelity environment; page counts unchanged across reruns; risk documented in §12 rather than adding a font dependency |

Files: `src/lib/print-document.ts`, `src/styles/print.css`,
`contract/references/MARKUP.md`, `src/routes/_authenticated/print.$runId.tsx`.
Validation: `tests/print-document.test.ts`, `tests/packet-document.test.ts`,
`tests/print-fidelity.test.ts` (all green; PDFs re-inspected), and
`scripts/check-print-contract.sh` (anchor rule untouched).

## 3. Findings — final DOCX

The real artifact is produced by an external agent; findings are about the
**prompt contract** (the only specification the agent receives) and the
**acceptance gate**, evidenced with a locally generated sample following the
old vs. new prompt (§11). Real cloud-agent output quality is
**unverifiable from this repo**.

| # | Problem | Evidence | Impact | Change |
|---|---------|----------|--------|--------|
| D1 | Prompt specified content structure but **zero document design**: no styles, page size, margins, typography, spacing, footers, or length target | old `buildFinalDocxPrompt` | Agent output defaults to a wall of text with bold-run "headings" — unpresentable without manual cleanup (see baseline sample, §11) | "Document design (mandatory)" section: US Letter/1in margins; real Word styles (Title/Heading 1/Heading 2/Normal, never faked headings, never skipped levels); one serif family, 11–12pt, spacing in the style (multiple, not exact height), no blank-paragraph spacing; one muted accent, grayscale-safe; footer page numbers after the title page; consistent table style with marked header rows; 3–5 page target |
| D2 | No document metadata requested | old prompt | Files open as "Document1"-grade artifacts; poor file manager/search behavior | Core properties mandated: title = piece title, author = student (else product name), date |
| D3 | No accessibility requirements | old prompt | Broken heading order and unmarked tables read poorly with AT | Heading hierarchy, alt text, and table header rows mandated |
| D4 | `studentContributions` were loaded by the job but never given to the prompt | `create-final-document-job/index.ts` passes them; old builder ignored them | The document could not reflect the student's stated beliefs/preferences | `CONTRIBUTIONS` block added to both final prompts |
| D5 | Acceptance gate only checked ZIP structure + a size floor on `word/document.xml` | old `ooxml.ts` | A well-formed ZIP wrapping a corrupt deflate stream, an empty body, or a style-less document still went `ready` | Validator now inflates the main part (`DecompressionStream`), requires `word/styles.xml`, and requires ≥1 body paragraph — still conservative enough that any real library output passes |
| D6 | No self-check before commit | old prompt | A truncated write fails the whole billed run at fetch-back | Prompt now requires re-opening the generated file with the same library before committing |

Files: `supabase/functions/_shared/followup-final.ts`,
`supabase/functions/_shared/ooxml.ts`. Validation:
`supabase/functions/_tests/followup.test.ts` (prompt content),
`_tests/ooxml.test.ts` (validator), `tests/office-artifacts.test.ts`
(the design rules are satisfiable and pass the gate).

## 4. Findings — final PPTX

| # | Problem | Evidence | Impact | Change |
|---|---------|----------|--------|--------|
| S1 | No slide design system: no size, no theme, no typography floors, no geometry rules | old `buildFinalPptxPrompt` | Default white 4:3-era look, pasted paragraph slides (see baseline sample, §11) | "Slide design (mandatory)" section: 16:9; one look (cream `#F7F4EC`/white, charcoal `#222222`, single accent `#1F4D3A`/`#B45309` for title/rule only); titles 28–32pt, body 18–24pt, sources 11–12pt, nothing below 11pt; identical title position; ≥0.5in content margins, no overflow; no decorative shapes |
| S2 | "One idea per slide" wasn't operationalized | old prompt asked for one finding per slide but allowed anything | Dense prose slides | Title must be a short assertion; ≤~40 words of body; prose goes to speaker notes; "do NOT paste document paragraphs onto slides" |
| S3 | Speaker notes only mentioned for the responses slide | old prompt | Presenter has nothing to say on most slides | 2–5 sentences of notes required on every content slide, in the student's voice |
| S4 | No slide numbers, no deck metadata | old prompt | Anonymous, hard-to-reference deck | Slide numbers bottom-right after the title slide; deck core properties mandated |
| S5 | Slide-count range (8–14) exceeded the product spec (7–10) | old prompt vs. `docs/research-workflow/06-final-artifacts.md` | Overlong decks | Range tightened to 8–12 (the plan enumerates ~10 slides) |
| S6 | Gate accepted a "deck" with zero slides as long as `ppt/presentation.xml` existed | old `ooxml.ts` | Stub decks could go `ready` | Validator requires ≥3 `ppt/slides/slideN.xml` parts (conservative floor, not the quality bar) |
| S7 | `studentContributions` unused; no self-check | same as D4/D6 | same | same changes applied to the PPTX prompt |

Files/validation: same as §3 plus
`supabase/functions/_tests/create-presentation-job.test.ts` (the PPTX job
finally has HTTP-contract tests mirroring the DOCX job's).

---

## 5. The annotation legend system

The printed page now teaches its own protocol in three layers:

1. **Full markup key** (top of page 1, both artifact types): seven compact
   monospace rows —
   - **Marks**: ✓ keep · ✗ cut · ~ rework (say how) · ★ expand · → move
     (say where) · ? unsure, plus the scope rule (a margin mark = the whole
     anchored block; underline/circle narrows it).
   - **Edits**: replacement (strike old, write new, join with a line),
     insertion (caret `^` + margin text), and the approval default
     (unmarked = unchanged).
   - **Dials**: WC/REG/VOI/RH, always signed, doubling = strength.
   - **Directives**: the fifteen uppercase tokens.
   - **Refer**: pre-printed S{n}P{m} anchors with a dictation example,
     hand-numbered handles ① ② ③, highlighter = use as-is.
   - **Example**: one worked micro-example (swap a word in S3P4).
   - **Avoid**: don't write over anchors, don't invent symbols, no floating
     marks, X-out notes that must not be applied.
2. **Per-page reminder** (`@bottom-left`, pages ≥ 2): the six symbols only.
3. **The contract** (`contract/references/MARKUP.md`): now defines
   everything the legend shows — the previously undefined Dials got a full
   section (semantics per dial, sign convention, scope, voice narrowing)
   and a "What not to mark" section mirroring the Avoid row. Legend and
   contract were re-synced; the legend's comment block names the pairing.

Dials were **added to MARKUP.md rather than removed from the legend**
because they were already the printed user interface; deleting them would
have silently changed user behavior.

## 6. Machine-readability design decisions

- **Per-page attribution**: document ref top-right on every page
  (`draft {runId8}` / `packet {packetId8} · v{n}`) + `Page n of m` folio →
  any single photo resolves to (document, version, page), and gaps in a
  returned set are detectable. Longform previously had no identifier at all.
- **Stable addresses**: pre-printed S{n}P{m} anchors (left margin, fixed
  column) and Q{n} question ids remain the canonical mark locations; the
  legend now explicitly tells users not to write over them.
- **Reading order & separability**: page furniture lives in `@page` margin
  boxes (outside the content flow); legend/packet furniture is div/span
  only, so it consumes no anchors and printed text is cleanly separable
  from pen input (the recognition prompt carries the question list for the
  same reason).
- **OCR-friendly output**: real text layer (vector PDF, embedded fonts,
  selectable text — verified via `unpdf` extraction in the fidelity tests);
  body near-black at 12pt serif; anchors 8pt `#888` monospace (muted but
  legible in the grayscale rasterizations inspected); no decorative
  elements anywhere on the page.
- **Grayscale-safe**: nothing on the page encodes meaning by color; the
  anchor amber (`#b45309` on screen) prints as `#888`.
- **Predictable annotation zones**: 2in right margin for pen work, ruled
  response lines at 0.35in pitch, boxed diagram areas — all with
  `break-inside: avoid` so a writing area never splits across pages.
- **The "Avoid" row** teaches the failure modes that most confuse
  interpretation (floating marks, invented symbols, reading ticks,
  notes-as-input), and MARKUP.md now specifies the X-out convention for
  private notes.

## 7. The annotation-interpretation skill

New skill: `.cursor/skills/annotation-interpretation/SKILL.md`, registered
in the AGENTS.md router ("reading scanned marked-up pages, recognition
prompts, resolving pen annotations to blocks"). It encodes: page anatomy
(print vs. pen, including the new furniture); identifier formats (S{n}P{m},
Q{n}/Q{n}.{m}/F.{m}, handles, document refs); the four-step resolution
precedence (anchor → handle → symbol class → content) from MARKUP.md;
per-mark handling rules; hard no-guess rules (unreadable = omit; unknown
symbol = ask; ~/★/→ without voice = unresolved; low confidence = explicit
verdict; bad photos = specific retake message); the expected structured
outputs (the `PageRecognition` schema and the change-log/Unresolved format);
pre-apply validation checks; and one worked example including a
must-not-apply case. Guarded by `tests/agent-os.test.ts` (routing + path
references).

## 8. Visual system

One editorial identity, adapted per medium:

| Element | Print artifact | DOCX | PPTX |
|---|---|---|---|
| Page/canvas | US Letter, 1.5/2/1.5/1.5in margins | US Letter, 1in margins | 16:9 (13.33×7.5in) |
| Body face | Source Serif 4, 12pt / 1.7 | one serif (Georgia/Cambria), 11–12pt / ~1.15–1.4 | serif or quiet sans, 18–24pt |
| Utility face | Source Code Pro (anchors, legend, furniture) | — | — |
| Headings | serif bold scale 20/16/13.5pt | Word styles: Title, H1 16pt, H2 13pt | titles 28–32pt, identical position |
| Accent | anchor amber on screen → gray on paper | one of deep green `#1F4D3A` / burnt orange `#B45309`, headings/rules only | same accent, title/rule only, on cream `#F7F4EC` or white |
| Identity/metadata | `hardcopy.tools` bottom-right; doc ref top-right | core properties (title/author/date) | core properties; slide numbers |
| Page/slide numbers | `Page n of m` folio | footer after title page | bottom-right after title slide |
| Grayscale | fully monochrome-safe | accent never information-bearing | no color-only encoding |

The print artifact intentionally stays quieter (the page belongs to the
user's pen); the Office artifacts carry the brand palette from
`docs/research-workflow/06-final-artifacts.md`.

## 9. Changes implemented

1. **Legend + contract** — rewritten 7-row markup key; Dials and "What not
   to mark" added to MARKUP.md (`src/lib/print-document.ts`,
   `contract/references/MARKUP.md`).
2. **Page furniture** — per-page symbol reminder (`@bottom-left`, off on
   page 1), per-page document ref (`@top-right`, both builders + run id
   wired from the print route), `nowrap` on all margin boxes, long-title
   trimming (`src/styles/print.css`, `src/lib/print-document.ts`,
   `src/routes/_authenticated/print.$runId.tsx`).
3. **DOCX prompt** — full document-design section, metadata, accessibility,
   length target, contributions block, pre-commit self-check
   (`supabase/functions/_shared/followup-final.ts`).
4. **PPTX prompt** — slide design system (palette, typography floors,
   geometry, notes, numbers, metadata), 8–12 slide range, contributions
   block, self-check (same file).
5. **OOXML validator** — entry inflation via `DecompressionStream`;
   docx: `word/styles.xml` + non-empty body required; pptx: ≥3 slide
   parts; corrupt deflate streams rejected; unknown compression methods
   skip content checks instead of failing
   (`supabase/functions/_shared/ooxml.ts`, now async).
6. **Local reference samples** — `docx` + `pptxgenjs` as devDependencies;
   fixture (`tests/fixtures/office/sample-piece.ts`) and generators
   (`tests/office-samples.ts`) implementing the prompt design systems;
   samples land in `test-artifacts/office/`.
7. **Annotation-interpretation skill** — new skill + router entry
   (`.cursor/skills/annotation-interpretation/SKILL.md`, `AGENTS.md`).
8. **Docs** — this review; print/validator notes synced into
   `docs/ARCHITECTURE.md`.

## 10. Validation added

- `tests/print-document.test.ts`: legend completeness (all seven rows,
  symbols, scope/replace/insert/approval/avoid content), reminder box +
  page-1 suppression, document-ref stamping (and absence without an id),
  long-title trimming.
- `tests/packet-document.test.ts`: packet ref content incl. the
  version-null degradation.
- `tests/print-fidelity.test.ts` (real Chromium PDFs): document ref present
  on **every page** of every fixture; symbol reminder on every page after
  the first and absent from page 1; packet ref on every packet page — plus
  all pre-existing anchor/pagination/furniture assertions.
- `supabase/functions/_tests/ooxml.test.ts`: rewritten for the deeper
  validator — content-bearing fixtures, corrupt-deflate rejection,
  missing-styles rejection, empty-body rejection, slide-count floor,
  exotic-compression tolerance.
- `supabase/functions/_tests/followup.test.ts`: prompt-builder tests for
  both final prompts (design rules present, all context blocks verbatim,
  placeholder degradation).
- `supabase/functions/_tests/create-presentation-job.test.ts`: new
  HTTP-contract suite (auth, ownership, idempotency replay, credit gate,
  insert race, happy path).
- `tests/office-artifacts.test.ts`: generates both samples and asserts the
  prompts' structural requirements on the real bytes — server gate passes
  (and kind-mismatch fails), metadata present, real heading styles used,
  section order, verbatim student words, hyperlink relationships, footer
  PAGE field, marked table headers, no blank-paragraph spacing; 8–12
  slides, 16:9, every shape in bounds, no run below 11pt, notes on every
  content slide, sources on their slide **and** the Sources slide, verbatim
  quotes in notes and off slides.

Golden-fixture note: assertions are structural (invariant under library
timestamps) rather than byte-golden, so they don't rot with `docx`/
`pptxgenjs` patch releases; the generated samples in `test-artifacts/`
serve as the visual goldens.

## 11. Before-and-after comparison

**Printable artifact** (fixtures re-rendered through the real pipeline):
- Before: 5-row legend with undefined Dials and no usage rules; symbols
  explained on page 1 only; longform pages carried no identifier; packet id
  on page 1 only.
- After: complete self-teaching legend with example and avoid-row; every
  page ≥2 carries the symbol reminder bottom-left; every page of every
  document carries its document/version ref top-right; page furniture
  verified non-colliding at 6.5–8.5pt across all fixtures. Pagination and
  anchor placement unchanged (fidelity suite green throughout).

**DOCX** (baseline generated per the old prompt's information content vs.
the new sample; both rendered via LibreOffice):
- Before: no title page, bold-run headings, no styles, no footer/page
  numbers, no metadata, single dense block flow, bare URLs.
- After: centered title page; styled H1/H2 hierarchy with a restrained
  green accent; consistent paragraph spacing; page-numbered footer; real
  hyperlinks; marked table header rows; correct core properties.

**PPTX** (same method):
- Before: white default deck, pasted document paragraphs at 14pt, no
  notes, no slide numbers, no metadata, inconsistent layout.
- After: cream/charcoal/forest-green system with an accent rule under an
  assertion-style title on every slide; ≤3–5 short bullets; muted source
  line per finding slide; slide numbers; speaker notes everywhere;
  verbatim student quotes confined to notes; deck metadata set.

**Caveat (unverifiable from this repo):** production DOCX/PPTX come from
external cloud agents. The comparison above demonstrates what the old vs.
new prompt *specifies and permits*, using compliant local implementations;
it cannot prove what a given agent will produce (§12).

## 12. Remaining risks and recommendations

1. **External generation remains probabilistic.** The prompts now specify
   the design system precisely and the local suite proves it's satisfiable,
   but an agent can still deviate; the server gate deliberately stays
   structural so legitimate output is never rejected on style. *Manual
   action:* after the next production `final_docx`/`final_pptx` runs, open
   both artifacts and compare against §8; tighten prompts if a rule is
   consistently ignored.
2. **Deployed functions must be redeployed** for the prompt/validator
   changes to take effect in Lovable Cloud — not doable from this repo
   (`docs/RUNBOOK.md` conventions apply).
3. **Legend glyph fallback** (P6): ✓ ✗ ★ → ① are not in the embedded latin
   subsets and render via OS fallback fonts. Stable in the tested
   environment; on other OSes the legend's wrap points could shift a line.
   If that ever destabilizes page 1, embed a small symbols subset with the
   other data-URI fonts.
4. **Validator ↔ library drift**: if a future OOXML library uses a
   non-`w:` namespace prefix or non-standard slide part names, the deepened
   docx body / pptx slide-count checks could false-negative. The checks are
   intentionally minimal; `_tests/ooxml.test.ts` documents the accepted
   shapes.
5. **Reminder strip legibility**: 6.5pt at `#999` is deliberately
   peripheral; on poor printers it may fade. It is redundant with the page-1
   legend by design.
6. **`docx`/`pptxgenjs` are devDependencies only** — nothing ships to the
   client or edge runtime; keep it that way.
