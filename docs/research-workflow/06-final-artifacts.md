# Deliverables 9 & 10 — Final Word Document and PowerPoint

Phases 6–7. The artifacts are products of the student's documented process,
not substitutes for it.

## Student contribution model (input to both artifacts)

After verification and follow-up research, extract from confirmed student
material: prior beliefs, lived experiences, reactions, selected findings,
skepticism, objections, local examples, expert contacts, proposed
validation, follow-up questions, changes in understanding, action ideas,
unresolved concerns, stylistic preferences, and phrases in the student's
natural voice. These **reshape** emphasis, organization, interpretation,
examples, argument, conclusions, recommendations, and next inquiry — they
are never merely appended. The distinction among what evidence establishes,
what the student believes, what the student experienced, what remains
uncertain, and what the system inferred is preserved through provenance
links (see [08-data-model-and-apis.md](08-data-model-and-apis.md)).

Student voice: use the student's phrasing, vocabulary, sentence rhythm,
examples, judgments, stated beliefs, and preferred formality **only to the
extent supported by their contributions**. Never invent experiences. When
insufficient student-authored material exists, use a clear academic style
and mark places for personal revision. Student review is required before
finalization.

## Word document specification

- Generated server-side with the `docx` library (real OOXML, real Word
  styles — Heading 1/2, Body Text, Caption, Table Grid, footnote/reference
  styles). Never flattened into images.
- Default length ~3–4 pages excluding references; longer only when
  justified by the assignment configuration.
- Structure: title; research question; concise context; major findings;
  evidence; findings from follow-up research (clearly marked as
  second-pass); the student's interpretation; personal or local connection
  where supplied; uncertainties or competing explanations; practical
  validation or next step; conclusion; references.
- Citation formatting per professor-configured style; references only for
  sources that exist in the provenance chain — **no fabricated citations**.
- 2–4 meaningful visuals (timelines, process diagrams, comparison tables,
  causal maps, stakeholder maps, data charts, evidence hierarchies,
  before/after comparisons), each with a caption, alt text, data-source
  identification, sourced-vs-conceptual labeling, honest scales, and
  grayscale legibility where practical. No decorative graphics.
- Accessible: real heading hierarchy, alt text on every figure, table
  headers, page numbers; readable on screen, printable, exportable to PDF.
- Stored in a private `final-artifacts` bucket; downloadable by the owner
  (and professor, per course permissions in Phase 8).

## PowerPoint specification

- Generated server-side with `pptxgenjs` from the **approved** Word
  document. If Word generation succeeds and PowerPoint generation fails,
  the Word document remains available and the presentation is retryable
  independently (separate jobs).
- 7–10 slides, adapted to the topic: title and inquiry; why the question
  matters; essential context; major finding; evidence or visualization;
  challenge or uncertainty; follow-up research and what changed; student
  interpretation or lived connection; validation plan or proposed action;
  class discussion question.
- Slides support speaking: short assertions, one idea per slide, speaker
  notes carry the prose. Never paste document paragraphs onto slides.

### Presentation visual identity

An original Hardcopy Tools style inspired by archival research documents,
historic diagrams, academic publishing, and warm editorial design:

- Palette: deep forest/naval green, muted burnt orange, warm cream,
  charcoal, restrained parchment tones; black-and-white imagery where
  appropriate.
- Type: serif display (matching the product's editorial identity) paired
  with a quiet sans-serif for labels; generous whitespace; linework
  reminiscent of historical diagrams; simple charts; restrained annotation
  motifs; minimal animation.
- Never copy Anthropic's logos, templates, visual assets, or trade dress.
- Avoid: neon gradients, glossy AI imagery, fake parchment textures that
  impair readability, tiny academic text, ornate decoration, paragraphs on
  slides, unsupported visual claims.
