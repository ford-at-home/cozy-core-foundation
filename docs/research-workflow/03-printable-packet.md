# Deliverable 5 — Printable Packet Specification

## Page geometry

US Letter (8.5 × 11 in), portrait, always. The packet uses the existing
print pipeline unchanged: `@page { size: letter; margin: 1.5in 2in 1.5in 0.5in }`
with the split left margin (0.5in page margin + 1in body padding in print) so
S{n}P{m} anchors stay inside the page content box. One renderer for preview,
Save-as-PDF, and paper (the browser's paged-media engine). Fonts are embedded
as data URIs so pagination is machine-independent.

## Page structure

1. **Packet header** — packet ID (short id, printed small), student name /
   course / date fields as ruled blanks, generation date. Unobtrusive
   Hardcopy Tools attribution stays in the existing `@bottom-right` margin
   box; the page belongs to the student.
2. **Markup key** — the existing MARKUP.md legend (symbols, dials,
   directives, voice grammar). The annotation shorthand is the existing
   authoritative system; no new notation is introduced. (A student-specific
   "research further" mark is a candidate addition — proposed for review in
   [04-return-and-recognition.md](04-return-and-recognition.md), not shipped.)
3. **Handwriting guidance** — calm, non-judgmental box explaining that
   another system will read the writing: print clearly, use dark ink, write
   inside the response areas, keep page and question numbers visible, draw
   shorthand marks distinctly, cross out clearly, give arrows visible
   endpoints. Always includes the dictation alternative verbatim: *"If your
   handwriting is difficult to read, you may dictate your answers and
   reference the page number, question number, or annotation mark. The
   system will combine your dictation with the photographed pages."*
4. **Packet body** — title, research inquiry, executive summary, major
   findings, evidence and source discussion, visuals, uncertainties and
   competing interpretations. Rendered from `packet.md` with S{n}P{m}
   anchors on, so body blocks are annotatable by anchor.
5. **Questions section** — the tailored questions (Q1…Qn), each with:
   - the question identifier (`Q3`),
   - a link line to the finding it references (`Refers to claim C2`),
   - the prompt (and optional smaller guidance line),
   - a bounded writing area (see below).
6. **Follow-up research section** — the required prompt plus three separate
   numbered response areas, each paired with the credibility sub-prompt.
7. **Return instructions** — how to photograph pages, and the dictation
   alternative.

## Writing-space rules (mandatory)

Every question includes physical space proportional to the expected
response. Never place dense prompts with no room to answer. Sizes:

| `response_space` | Rendering | Approximate height |
| --- | --- | --- |
| `lines_3` | 3 ruled lines | 1.05 in |
| `lines_5` | 5 ruled lines | 1.75 in |
| `third_page` | 8 ruled lines | 2.8 in |
| `half_page` | 11 ruled lines | 3.85 in |
| `box` | bordered open box (for lists/diagrams) | 2 in |

Rules:

- Ruled lines are 0.35in apart — comfortable for ordinary handwriting.
- A question block (header + prompt + writing area) never splits across a
  page break (`break-inside: avoid`); a block that does not fit moves whole
  to the next page. Unused space at the bottom of the previous page is
  acceptable — the paper is an interface, not a terms-and-conditions
  pamphlet.
- Follow-up areas are three separate `lines_5`-sized areas with the
  credibility sub-prompt under each.
- The student may leave answers blank; unused space is fine.

## Anchor interaction (S{n}P{m} sync contract)

The anchor counting rule in `src/styles/print.css`,
`contract/references/MARKUP.md`, and `tests/anchor-reference.ts` is
**unchanged**. All packet furniture — header, legend, guidance, question
blocks, response areas, return instructions — is built from `div`/`span`
elements only, which the anchor counters do not count. The packet **body**
(markdown) keeps its anchors, so students can annotate findings by anchor
exactly as in the existing markup workflow. Questions are addressed by their
`Q{n}` identifier, not by anchor.

## Visuals in the packet

The packet is not limited to one generic image. The agent identifies
concepts that benefit from visual explanation (process diagrams, timelines,
causal maps, stakeholder maps, comparison tables, annotated charts, evidence
hierarchies, decision trees) and includes them where they meaningfully
improve understanding — no rigid quota. Every visual must clarify a real
concept, remain readable in print and in grayscale where practical, carry a
caption, identify whether it is data-driven or conceptual, and cite data
sources where applicable. Comparison tables render as markdown tables (which
are anchorable blocks); images follow the existing commit-pinned
`assets/` pattern.

## Question placement

Where space permits, a question may sit near the finding or visual it
references (the `claim_ref` line always names the connection). Longer
responses live in the dedicated questions section. Phase 1 renders all
questions in the dedicated section after the body — inline placement is a
layout refinement that must not jeopardize pagination determinism.

## Photo-return instructions (printed in the packet)

- Photograph one page per image for best results; keep the whole page in
  frame, avoid glare and shadows.
- Up to four–six pages in one photo is acceptable **only** if the writing
  remains large and clear (Phase 4).
- Keep page numbers visible in every photo.
- Or dictate your answers referencing page and question numbers.
