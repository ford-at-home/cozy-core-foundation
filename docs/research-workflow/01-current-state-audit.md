# Deliverable 1 — Current-State Audit

Verified against the repository on 2026-07-13 (branch base `main`,
commit `979d666`). Status vocabulary matches `docs/ARCHITECTURE.md`:
**implemented**, **partial**, **missing**, **external**.

## Backend-handoff verification (2026-07-13, post-Phase-1)

A claimed backend handoff ("schema, migrations, RLS, storage, workflow
state, and Edge Functions for the full return/recognition/follow-up/
artifact workflow") was verified against migrations, generated types, and
`supabase/functions/` — **only the Phase 1 slice existed**. None of the
Phase 2–7 tables (`packet_returns`, `page_images`, `recognized_blocks`,
`dictation_segments`, `verification_corrections`, `followup_questions`,
`final_artifacts`), buckets (`packet-returns`, `final-artifacts`), or Edge
Functions beyond packet generation had been delivered at that time.

**Update (same day):** the backend handoff subsequently landed on `main` —
migration `20260713043040_1528bbcd…` (return/recognition/follow-up/artifact
tables, `pieces.workflow_stage` FSM, storage buckets), eight Edge Functions,
regenerated Supabase types, and `BACKEND-CONTRACTS.md`. An interim migration
this branch had added while the backend was missing
(`20260713060000_packet_return_workflow.sql`) was **removed** in favor of the
delivered schema; the client modules (`src/lib/packet-workflow.ts`,
`src/lib/packet-stage.ts`) now target the delivered contracts.

Two delivered-backend caveats the frontend works around (row-derived stage
instead of `pieces.workflow_stage`):

1. Nothing advances the FSM through the early stages (`draft →
   initial_research_pending → … → packet_ready`) — `start-workflow` and the
   packet completion path never call `advance_workflow_stage`, and
   `draft → awaiting_student_return` is an invalid hop, so every FSM call in
   the return/verification functions no-ops with a logged warning for pieces
   that started before (or via) the current packet pipeline.
2. ~~Nothing updates `packet_returns.status` past `uploading`~~ — fixed:
   `analyze-returned-page` now settles the return to `ready`/`failed` once
   every page is terminal. The UI still derives a return's effective status
   from rows (`deriveReturnUiStatus`) because the verification verdict lives
   in `verification_corrections`, not on the return row.
3. ~~No approval path for follow-up questions~~ — fixed:
   `run-follow-up-research` requires `followup_questions.status='approved'`
   with `approved_text`, but the delivered `prepare-follow-up-questions` only
   ever wrote `submitted`/`refined` and the client is SELECT-only on the
   table, so the gate was unreachable. `prepare-follow-up-questions` now has
   an approve mode (`{ approve: true, questions: [{studentText,
   approvedText, suggestedText?}] }`) that preserves the student's original
   wording alongside the approved one, and refuses changes once the set is
   `researched`.
4. ~~`loadPriorPacketContext` dropped most verified responses~~ — fixed: it
   only joined blocks already carrying `linked_question_id` and ignored
   dictation segments, correction-based question reassignment
   (`corrected_meaning.questionId`), and rejections. The assembly is now the
   pure `assembleVerifiedResponses` (tested in `_tests/followup.test.ts`)
   walking packet → returns → pages → blocks plus segments, with the same
   latest-correction-wins / empty-is-rejection rules as the review UI.
5. ~~`final_artifacts` rows stuck `pending` when the run fails~~ — fixed:
   nothing settled the artifact row on run failure/cancellation, so the UI
   could never distinguish "generating" from "dead" or offer a retry.
   `settleFinalArtifactFailure` now runs on every failure/cancel path in
   `cursor-webhook` and `reconcile-runs` (never downgrades `ready`).
6. ~~Final DOCX/PPTX prompts shipped with `(missing)` packet body~~ — fixed:
   `create-final-document-job` / `create-presentation-job` passed
   `packetBody: null, followupSummary: null` although their prompt templates
   render both verbatim. `loadPacketBodies` now reads the v1 packet body and
   the latest follow-up report from the persisted run results.

## Capability inventory

| Capability | Status | Where | Notes |
| --- | --- | --- | --- |
| Research pipeline (deep research) | Implemented | `supabase/functions/_shared/parallel.ts`, `_shared/research.ts`, `start-workflow` | Parallel Task API; output is freeform markdown + extracted source URLs (`ResearchResult`). No structured claims schema. |
| Source schema | Partial | `parallel.ts` (`sourceUrls`) | URLs only — no typed source records (type, authority, date). |
| Claim schema | Missing | — | Added in Phase 1 as `packets.analysis` (see deliverable 2). |
| Artifact schema | Partial | `agent_runs.result` JSONB (`channels[].files[]`), GitHub `pieces/<slug>/` | Markdown-file oriented; no artifact table. |
| Print renderer | Implemented | `src/lib/print-document.ts`, `src/styles/print.css` | US Letter, split left margin, S{n}P{m} anchors, embedded fonts, single paged-media renderer. |
| PDF renderer | Implemented | `src/routes/_authenticated/print.$runId.tsx` | Browser print dialog / Save-as-PDF. No client PDF library by design. |
| Writing space / response areas in print | Missing → Phase 1 | `print.css` | Pre-Phase-1: wide margins only; no ruled lines, response boxes, or reader questions. |
| Word document generation | Missing | — | No `docx`/office library anywhere. Phase 6. |
| PowerPoint generation | Missing | — | Phase 7. |
| Visual generation | Implemented | `src/routes/api/public/generate-image.ts`, `_shared/image-token.ts` | Per-run HMAC bearer; agents commit PNGs to `pieces/<slug>/assets/`. |
| Image upload | Partial | `src/routes/_authenticated/new.tsx`, `research-attachments` bucket | Research inputs only; no photo return of marked pages (Phase 2). |
| OCR / multimodal recognition | Partial | `start-workflow/index.ts` (`ocrPdf`) | Gemini 2.5 Flash via Lovable gateway, scanned-PDF fallback only. No handwriting recognition (Phases 2–3). |
| Dictation | Partial | `src/routes/api/transcribe.ts`, `profile.tsx` | `openai/gpt-4o-mini-transcribe`; wired only to the profile voice text. Phase 2 wires it to packet return. |
| Job orchestration | Implemented | `_shared/state.ts`, `dispatch.ts`, `complete.ts`, `reconcile-runs`, `cursor-webhook` | Monotonic state machine, insert-before-dispatch, idempotency keys, reconciler-as-authority. |
| User authentication | Implemented | Supabase auth, `_authenticated` route guard | Single-owner model. |
| Professor / course model | Missing | — | No roles, courses, assignments, or sharing. Phase 8. |
| Artifact storage | Implemented (markdown) | GitHub repo + `agent_runs.result` | Office artifacts will need a private storage bucket (Phase 6). |
| Credit accounting | Implemented | `docs/BILLING.md`, `_shared/credits.ts`, `20260712140000_credit_ledger.sql` | Append-only ledger; reserve → settle/release; SECURITY DEFINER functions. |
| Supabase functions | Implemented | `supabase/functions/` | `start-workflow`, `piece-action`, `cursor-webhook`, `reconcile-runs`, `create-checkout-session`, `stripe-webhook`. |
| Lovable backend functions | External | Lovable Cloud | Secrets and deployment are dashboard-side; documented in `docs/RUNBOOK.md`. |
| Privacy controls | Partial | RLS everywhere; `research-attachments` folder scoping | No retention policies, no handwriting profiles yet (Phases 2–3, 8). |
| Annotation shorthand | Implemented | `contract/references/MARKUP.md` | Authoritative existing system (symbols, dials, directives, S{n}P{m}, numbered handles). **Reused as-is** — no new notation shipped. |
| Reader-facing Socratic questions | Missing → Phase 1 | — | `notes/tighten.md` questions are writer-facing, not reader-facing. |
| Activity record | Partial | `agent_run_events` | Append-only per-run audit trail exists; workflow-level surface is Phase 8. |
| Relevant tests | Implemented | `tests/`, `supabase/functions/_tests/`, `supabase/tests/` | Print fidelity (real Chromium), prompt content, state machine, credits, billing boundaries. No React component tests (known gap). |

## Contradictions and dead ends found

- `buildRevisionPrompt` describes annotations as "dictated" but the UI only
  accepts a typed transcript (`runs.$runId.tsx`). Marketing copy on the
  landing page also implies dictation. Resolved by Phase 2.
- `pieces.stage = 'printed'` exists in the CHECK constraint but is never set
  by any code path.
- The `contract/` synthesize contract requires a non-empty voice profile;
  the packet workflow deliberately does **not** (a research packet is a
  research artifact, not the author's prose — voice enters at Phase 6
  final synthesis).

## Reuse decisions (no duplicate pipelines)

| Need | Reused implementation |
| --- | --- |
| Deep research | Existing Parallel research runs + chain pattern (`completeResearchAndChain`) |
| Content generation | Existing Cursor cloud-agent dispatch (`dispatchRun`) + GitHub fetch-back (`fetchRunResult`) |
| Credits | Existing reserve/settle/release lifecycle; packet uses the existing `compose` (1) / `research` (2) costs |
| Print/PDF | Existing `buildPrintDocument` pipeline extended with a packet builder; same `print.css`, same anchors |
| Annotation shorthand | `contract/references/MARKUP.md` unchanged |
| Dictation | Existing `/api/transcribe` route (Phase 2 wires it to packet return) |
| Photo upload | Existing private-bucket + folder-scoped RLS pattern from `research-attachments` |
