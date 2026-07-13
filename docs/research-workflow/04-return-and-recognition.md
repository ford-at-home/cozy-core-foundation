# Deliverables 6 & 7 — Handwriting/Photo Architecture and Dictation Architecture

Phases 2–4. Nothing in this document is implemented in Phase 1; it defines
the architecture the Phase 1 data model must not contradict.

## Return paths

Two complementary paths, usable alone or together:

- **Path A — Dictation**: the student dictates answers, page-level edits,
  shorthand annotations, corrections, examples, personal experiences,
  follow-up questions, and changes of interpretation, referencing locations
  the way MARKUP.md already teaches ("Page 3, Question 2", "S4P3: …",
  "Mark three: …", "The research-further mark in the left margin",
  "Follow-up question number 1").
- **Path B — Photographed pages**: phone photos of completed pages.

## Photo capture and upload (Phase 2 single page; Phase 4 multi-page)

- New private storage bucket `packet-returns`, folder-scoped RLS identical
  to `research-attachments` (`auth.uid()/` prefix), configurable retention.
- Mobile capture uses `<input type="file" accept="image/*" capture="environment">`
  so the camera opens directly on phones.
- Phase 4 adds: batch upload in sequence, automatic page detection,
  automatic orientation correction, page-order detection where reliable with
  manual reordering, missing-page and duplicate-page detection, retake flow,
  and multiple pages per photo **only when text remains large enough for
  reliable recognition** — recognition quality takes priority over
  convenience; no fixed pages-per-photo is forced.

## Image quality validation (before recognition)

Inspect focus, glare, shadows, skew, cropped page edges, orientation, page
overlap, handwriting size, contrast, resolution, and whether multiple pages
can be separated reliably. Inadequate images produce a retake request naming
the specific problem. **Never fabricate unreadable handwriting.**

## Recognition pipeline

Multimodal recognition (same Lovable gateway pattern as the existing
scanned-PDF OCR, model per `docs/CONFIGURATION.md`) prompted with the
packet's own printed content (body markdown + question prompts + anchor map)
so the model can separate printed text from handwriting. Recognize: printed
packet text (for alignment), handwritten responses, shorthand marks, arrows,
underlines, circles, crossed-out text, margin notes, page numbers, question
numbers, and the connections between annotations and source text.

For every handwritten element retain: source image, packet ID, page ID,
approximate location, recognized text, confidence score, interpreted
annotation type, interpretation confidence, linked question or source
passage, dictated supplement, and user-confirmed correction
(`recognized_blocks` — see [08-data-model-and-apis.md](08-data-model-and-apis.md)).

Preserve the distinction among original printed content, student
handwriting, student dictation, inferred annotation meaning, and
system-generated interpretation. Never merge these prematurely.

Cost accounting: each recognition call records an idempotent inference row
(`lovable:hwr:{returnId}:{imagePath}`), following the existing
`recordInference` pattern. Recognition and re-recognition after retake are
free to the student (no generation credit).

## Adaptive handwriting recognition (Phase 3)

- Per-user `handwriting_profiles` row: recurring letter shapes, common
  abbreviations, spacing habits, shorthand symbol styles, frequent
  vocabulary, number forms, deletion marks, arrow/bracket styles — expressed
  as a compact text profile fed into the recognition prompt.
- Built **only** from user-confirmed corrections; explicit consent gate
  before the first profile write; visible in settings; deletable at any time
  (deletion removes the profile and stops adaptation, not past artifacts).
- One student's profile never applies to another. No training on student
  writing for unrelated purposes.

## Mandatory human verification

Before follow-up research or final artifacts, a verification screen shows
the photographed page beside recognized text. The student can: correct
transcription errors, confirm annotation meanings, resolve ambiguous
references, identify ignored content, confirm follow-up questions, reconcile
handwriting vs. dictation, and approve the interpretation. Low-confidence
recognition is highlighted. Corrections feed later pages in the same return
where appropriate. Inferred handwriting is never presented as confirmed
student writing.

## Dictation architecture

- Reuses `/api/transcribe` (existing auth + gateway).
- Transcript segmentation maps references to packet / page / section /
  question / source passage / annotation using the MARKUP.md resolution
  order (block anchor → hand-numbered handle → symbol class → content),
  extended with `Q{n}` question references and page numbers.
- Transcript review before synthesis: the student sees the segmented
  transcript with its resolved targets and can fix any mapping.

## Conflicts between handwriting and dictation

- Never silently choose one. Show both versions side by side; the student
  picks which controls. The rejected version is preserved in the activity
  record. The approved version feeds follow-up research and synthesis.
- Where dictation merely clarifies unreadable handwriting, merge after
  confirmation.

## Annotation shorthand status

`contract/references/MARKUP.md` is the authoritative existing shorthand and
is reused unchanged. One packet-specific need has no existing mark: flagging
a passage as **"research further"**. Proposal (for review before any
implementation — not shipped): dictionary token `RF` in the directive
vocabulary, resolving to "carry this passage into a follow-up research
question". Until reviewed, students write `?` plus a margin note or dictate
the intent, both of which the existing protocol already supports.

## Failure and edge cases

| Case | Behavior |
| --- | --- |
| Unreadable / highly stylized handwriting, faint pencil | Low-confidence flag → verification screen requires explicit confirmation or dictation; never guessed silently |
| Page glare / shadows / crop | Quality gate rejects with a specific retake reason |
| Missing pages | Page inventory vs. packet page count → named missing pages |
| Duplicated pages | Deduplicate by page id; keep the sharper image |
| Wrong page order | Order by recognized page number; manual reorder UI |
| Multiple pages in one photo | Split when separable; otherwise ask for single-page retakes |
| Crossed-out responses | Recognized as deletions, kept distinct from active text |
| Notes continued on another page / arrows spanning sections | Linked blocks; ambiguity surfaces in verification |
| Ambiguous shorthand | MARKUP.md ambiguity rules: show candidates, ask one question |
| Conflicting handwriting and dictation | Both shown; student decides; rejected version preserved |
| Sensitive personal information in handwriting | Private storage, RLS, retention controls; never used for profile training without consent |
| Handwriting-profile deletion | Immediate delete; recognition falls back to non-adaptive |
| Student uploads another person's work | Uploads are bound to the authenticated account and packet ID; mismatched packet IDs are rejected at verification |
