# Deliverable 1 — Current-State Audit

Verified against the repository on 2026-07-13 (branch base `main`,
commit `979d666`). Status vocabulary matches `docs/ARCHITECTURE.md`:
**implemented**, **partial**, **missing**, **external**.

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
