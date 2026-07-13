# Research Workflow — College Research Packets

Specification set for extending Hardcopy Draft into a research-and-learning
workflow for college professors and their students. The product principle:
**AI prepares the material, then stops. The student reads on paper, marks,
questions, and decides what deserves further investigation. The system
resumes only when the student returns their work.**

The full learning loop:

```
Initial research
  → Claim, evidence, and method analysis
  → Printable research packet (US Letter, real writing space)
  → Student reading and annotation (on paper)
  → Research-specific Socratic questions (answered by hand)
  → Student reflection and follow-up questions
  → Photo upload and/or dictation
  → Handwriting and annotation verification (mandatory human step)
  → Focused follow-up research (up to three approved questions)
  → Revised research packet
  → Final synthesis (student contribution model)
  → Editable Word document
  → Class presentation (PowerPoint)
  → Community validation or further inquiry
```

Short version: **Research → Print → Think → Mark → Question → Return →
Research Again → Present.**

## Document map

| File | Deliverable(s) |
| --- | --- |
| [01-current-state-audit.md](01-current-state-audit.md) | 1 — Current-state audit |
| [02-research-analysis-and-questions.md](02-research-analysis-and-questions.md) | 2, 3 — Research analysis schema; tailored question specification and rubric |
| [03-printable-packet.md](03-printable-packet.md) | 5 — Printable packet specification |
| [04-return-and-recognition.md](04-return-and-recognition.md) | 6, 7 — Handwriting/photo architecture; dictation architecture |
| [05-follow-up-research.md](05-follow-up-research.md) | 4, 8 — Follow-up research; revised packet; billing behavior |
| [06-final-artifacts.md](06-final-artifacts.md) | 9, 10 — Word document; PowerPoint |
| [07-professor-and-privacy.md](07-professor-and-privacy.md) | 11 — Professor controls; academic transparency; privacy |
| [08-data-model-and-apis.md](08-data-model-and-apis.md) | 12 — Data model, endpoints, job states, provenance |
| [09-testing-plan.md](09-testing-plan.md) | 13 — Testing plan |
| This file | 14 — Phased implementation plan; final standard |

## Non-negotiable requirement: every question must be specific

Generic reflection prompts ("What assumptions are being made?", "Why does
this matter?", "What evidence is missing?") are **prohibited as final
questions**. Every printed question must be rewritten around the actual
research: a particular finding, a named source, a dataset, a method, a
measured outcome, an affected population, an institution, a jurisdiction, a
time period, a comparison group, an expert role, a stakeholder, a disputed
definition, a causal claim, a missing perspective, a practical decision, or a
local validation opportunity. A question that could be reused unchanged on an
unrelated research topic is rejected. See
[02-research-analysis-and-questions.md](02-research-analysis-and-questions.md).

## Phased implementation plan

Each phase is one coherent PR. Later phases depend on earlier ones; no phase
requires rework of a prior phase's data model.

### Phase 1 — Tailored questions and writing space (implemented in this PR)

- `research_packet` workflow on `/new` (topic → deep research → packet, or
  paste research → packet), reusing the existing run orchestration.
- Packet compose agent produces a **structured research analysis**
  (`analysis.json`), **tailored questions** (`questions.json`), and the
  packet body (`packet.md`); fetch-back persists them to the new `packets`
  and `packet_questions` tables.
- Question review screen: edit, lock, add, approve before printing.
- Packet print document: question blocks with real ruled writing space,
  three follow-up-research areas, handwriting guidance, return instructions,
  packet ID and student/course fields. The S{n}P{m} anchor rule is untouched;
  question blocks consume no anchors.

### Phase 2 — Single-page photo return and dictation

- Mobile photo capture of completed pages (`packet-returns` private bucket).
- Image-quality validation (focus, glare, shadows, skew, cropped edges,
  orientation, contrast, resolution) with retake prompts — never fabricate
  unreadable handwriting.
- Multimodal recognition of handwriting per response area, with per-element
  confidence; dictation wired into the return flow with page/question
  references; transcript review; **mandatory verification UI** before
  anything downstream consumes recognized text.

### Phase 3 — Adaptive handwriting recognition

- Per-user handwriting profile built only from user-confirmed corrections,
  with explicit consent, per-user isolation, and deletion controls.
- Shorthand interpretation (MARKUP.md symbol vocabulary), correction feedback
  loop within a session.

### Phase 4 — Multi-page return

- Batch upload, automatic page detection and orientation correction,
  page-order detection with manual reordering, missing/duplicate-page
  handling, multiple pages per photo only when text remains large enough for
  reliable recognition (recognition quality over convenience).

### Phase 5 — Follow-up research

- Up to three follow-up questions (from handwriting, dictation, direct entry,
  or approved suggestions); quality check with visible refinement the student
  approves or edits — never rewrite the student's question invisibly.
- Focused second Parallel research pass preserving the original inquiry,
  sources, and findings; provenance for every new source.
- Revised packet / concise addendum / replacement pages / change summary.
- Billing: one follow-up pass (covering up to three approved questions) is a
  research-class action (2 credits), reserved at dispatch, settled on
  completion, released on failure. Verification, correction, re-rendering,
  printing, and downloading remain free. Costs are shown before dispatch.

### Phase 6 — Final Word document

- Student contribution model (prior beliefs, lived experience, skepticism,
  local examples, follow-up questions, changes in understanding) reshapes
  emphasis, organization, and conclusions — never merely appended.
- 3–4 page editable DOCX (via the `docx` library, server-side), real Word
  styles, 2–4 evidence-grounded visuals with captions and alt text, no
  fabricated citations, student review before finalization.

### Phase 7 — PowerPoint presentation

- 7–10 speaking-support slides generated from the approved Word document
  (via `pptxgenjs`, server-side), original Hardcopy Tools archival-editorial
  visual identity (no third-party trade dress), class discussion prompts.

### Phase 8 — Professor and course features

- Courses, assignments, enrollments; professor configuration (question
  count/functions, citation style, source requirements, retention policy,
  review gates); professor review of questions and follow-up research;
  activity record surface (process transparency — no "AI percentage").

## Final standard

The system succeeds when the student can explain: what the research says,
which evidence supports it, where the evidence may be weak, what they
initially believed, how their thinking changed, what further research they
requested, what the new research added, what remains uncertain, how the
findings could be tested in the real world, and what they now believe should
happen next. The Word document and PowerPoint are products of that process,
not substitutes for it.
