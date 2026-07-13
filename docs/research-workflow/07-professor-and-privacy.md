# Deliverable 11 — Professor Controls, Academic Transparency, and Privacy

Phase 8 (courses/assignments) building on Phase 1's review surface.

## Professor configuration (per assignment)

Course; assignment; discipline; student level; research depth; source
requirements; citation style; number of tailored questions; required
question functions; number of follow-up research questions; whether
follow-up research is required; whether students must identify authoritative
sources; expected local validation; final document length; presentation
length; whether personal reflection is required; whether dictation is
permitted; whether photo upload is permitted; image retention policy;
whether professors review questions before printing; whether professors
review follow-up research before dispatch; whether the class receives
discussion prompts.

## Professor review capabilities

- Review generated questions; edit them; lock required questions; add
  course-specific questions; see which claim generated each question
  (`packet_questions.claim_ref` → `packets.analysis`).
- Review proposed follow-up questions; approve or reject follow-up research
  before credits are consumed.
- Inspect provenance end to end (research → analysis → questions → student
  responses → follow-up → artifacts).

Phase 1 ships the same review surface **owner-facing** (the packet review
screen: edit / lock / add / approve). Phase 8 re-scopes it to the professor
role via course permissions without schema rework — `packet_questions`
already records `source` and `locked`.

## Academic transparency (activity record)

Maintain a record showing: initial inquiry; research conducted; sources
used; packet generated; questions generated; pages returned; dictation
supplied; recognition confidence; student corrections; follow-up questions
submitted; follow-up research conducted; new sources added; conclusions
changed; student contributions incorporated; final artifact generated;
student edits after generation; presentation generated.

Implementation: the existing append-only `agent_run_events` plus
workflow-level events on the packet entities (Phase 8 adds the read
surface). The record supports transparency, **not surveillance**: no "AI
percentage" is ever computed or displayed. The meaningful record is the
process.

## Privacy and data handling

Student pages may contain personal reflections. Requirements:

- Authenticated access everywhere; private storage buckets
  (`packet-returns`, `final-artifacts`) with folder-scoped RLS.
- Secure uploads (existing signed-upload pattern); limited retention with
  institution-configurable windows; clear deletion controls (packet return
  images, dictation transcripts, handwriting profiles).
- Course-level permissions (professor sees student work only within their
  course; students never see each other's returns).
- User-specific handwriting profiles; strict separation between users; no
  training on student writing for unrelated purposes without explicit
  authorization.
- Secure artifact sharing (expiring signed URLs, never public buckets).
- Provenance preserved between source evidence, system synthesis, student
  handwriting, student dictation, recognition corrections, follow-up
  research, and final text.
