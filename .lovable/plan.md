## Scope

Build the backend foundations for research-workflow Phases 2–8 (return + recognition, follow-up research, final Word/PPTX, courses + professor role). Phase 1 (packet generation) stays as-is. No substantive UI changes; existing Edge Functions untouched except for tiny compatibility hooks. All work lands as additive migrations and new Edge Functions.

Risk is high (large surface). Mitigations: strict phase ordering; every phase ships with its own tests before the next starts; every new table gets RLS + GRANTs in the same migration; every new Edge Function is deploy-idle (no cron) until Phase 8; no client-writable workflow-state columns.

## Phase A — Audit & capability matrix (no code)

Produce `docs/research-workflow/BACKEND-CAPABILITY-MATRIX.md` listing every workflow capability × {complete, partial, schema-only, missing, contradictory}. Derived from current migrations, `docs/ARCHITECTURE.md`, `docs/BILLING.md`, and existing functions in `supabase/functions/`. This is the source of truth for what the later phases actually build vs. reuse.

## Phase B — Workflow state model

Add authoritative `workflow_stage` to `pieces` (enum extended over the packet flow's current `workflow` column, or a new `workflow_stage` column; decision recorded in the matrix). Ship as a Postgres enum + validation trigger enforcing allowed transitions server-side. Client `UPDATE` on the column stays revoked; only SECURITY DEFINER helpers or Edge Functions advance it. Reuses the existing `agent_runs` state machine unchanged.

Transitions covered: draft → initial_research_* → packet_* → awaiting_student_return → student_return_received → recognition_running → responses_need_review → responses_verified → follow_up_* → final_document_* → presentation_* → complete / failed.

## Phase C — Courses, assignments, professor role

Migration adds:
- `app_role` enum extended with `professor` (keeps existing `has_role` pattern; no role columns on profiles).
- `courses`, `assignments`, `enrollments` tables with RLS: students see rows where they're enrolled; professors see rows they own; admins full.
- Nullable `assignment_id` on `pieces` for optional coursework linkage.

## Phase D — Return & recognition (Phase 2 in the workflow docs)

Migrations for `packet_returns`, `page_images`, `recognized_blocks`, `dictation_segments`, `verification_corrections`, `handwriting_profiles`. Private storage bucket `packet-returns` (user-scoped path `user_id/return_id/page_n.jpg`), plus `dictation-audio` bucket. Storage RLS keyed on path prefix = `auth.uid()`.

New Edge Functions (all JWT + ownership-checked, idempotent by `request_id`):
- `create-student-return-upload` — creates `packet_returns` row, returns signed upload URLs.
- `analyze-returned-page` — orchestrates image-quality + handwriting extraction via Lovable AI Gateway (Gemini multimodal); writes `recognized_blocks`. Not billable.
- `submit-dictation` — persists dictation segment, calls existing `/api/transcribe`; not billable.
- `verify-student-responses` — writes `verification_corrections`; enforces `verified` state distinct from raw recognition.

## Phase E — Follow-up research (Phase 5)

Migration adds `followup_questions` (packet_id, position 1–3 with UNIQUE constraint, student_text, suggested_text, approved_text, status). No overwrite of original questions.

New Edge Functions:
- `prepare-follow-up-questions` — validates ≤3, returns proposed refinements without silent replacement.
- `run-follow-up-research` — **billable, 2 credits**. Reserves via existing `reserve_credits`, dispatches an `agent_runs` row with `kind='followup_research'` (extend CHECK constraint), and on fetch-back writes a new `packets` row with `version = n+1` and `supersedes_packet_id` set. Reuses `_shared/packet.ts` persistence + `_shared/state.ts`.

## Phase F — Final artifacts (Phase 6)

Migration adds `final_artifacts` (piece_id, kind: docx | pptx | visual, storage_path, provenance jsonb, status), `student_contributions`, private bucket `final-artifacts`.

New Edge Functions (both billable — **user must confirm exact credit amounts before Phase F ships**; placeholder is 2 credits each in the plan, backed out if not confirmed):
- `create-final-document-job` — reserves credits, creates `agent_runs` with `kind='final_docx'`, contract only (actual DOCX rendering handled by the existing Cursor provider path in a later task).
- `create-presentation-job` — same shape, `kind='final_pptx'`.

Both are job-creation contracts; no in-migration document layout code.

## Phase G — Activity history

`agent_run_events` already exists. Add `piece_events` (piece_id, actor, event, metadata) for packet-level events not tied to a run: packet_downloaded, pages_uploaded, verification_completed, followups_approved, final_generated. Written by Edge Functions only; client read-own via RLS.

## Phase H — Tests + types + docs

For each phase D–G:
- Deno tests in `supabase/functions/_tests/` for pure `_shared` logic (state transitions, followup validation ≤3, reservation/settle/release paths).
- SQL test file `supabase/tests/workflow-rls.test.sql` covering owner/other/professor/anon matrix.
- Regenerate `src/integrations/supabase/types.ts` after each migration (manual step; called out in RUNBOOK).
- Update `docs/RUNBOOK.md`, `docs/BILLING.md` (new billable ops), and add `docs/research-workflow/BACKEND-CONTRACTS.md` — the handoff document listing every new table, function name, request/response schema, workflow state, storage path, error code.

Secret audit at the end confirms `LOVABLE_API_KEY`, `PARALLEL_API_KEY`, `CURSOR_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` cover the new workflow; nothing new is requested unless a genuine gap appears (unlikely — multimodal recognition goes through Lovable AI Gateway).

## Not in this task

- DOCX / PPTX rendering itself (contract only).
- UI wiring for any of the new endpoints.
- Modifying existing Edge Functions' behavior (only additive compatibility: extend `agent_runs.kind` CHECK constraint).
- New billing model / pricing changes beyond reserving on the three billable ops above.
- Public storage of student handwriting.

## Deliverable per phase

Each phase ends with: migration file(s), edge function(s), tests passing (`npm run test:functions`, `bash scripts/check-migrations.sh`, `bash scripts/check-secrets.sh`), `docs/research-workflow/BACKEND-CAPABILITY-MATRIX.md` updated, and an explicit "manual actions still required" list (regenerate types, deploy functions X/Y/Z, no dashboard steps).

## Confirmations needed before I start building

1. Credit prices for `run-follow-up-research`, `create-final-document-job`, `create-presentation-job` (I'll use 2 / 2 / 2 unless you say otherwise).
2. OK to add `professor` to `app_role` enum and the courses/assignments/enrollments tables now (has real blast radius: every new table's RLS references it).
3. OK to introduce `workflow_stage` on `pieces` in Phase B, superseding the current `workflow` column semantically (kept as a source input, not as workflow state).
