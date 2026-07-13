# Backend Contracts — Research Workflow (Phases B–G)

Handoff for the application-implementation agent. All endpoints are Supabase
Edge Functions, JWT-authenticated, POST-only. Ownership is verified inside
each function (service role bypasses RLS).

## Workflow FSM

`pieces.workflow_stage` — text column, CHECK-constrained. Advanced only by
the SECURITY DEFINER function `advance_workflow_stage(_piece_id, _to,
_actor)`, EXECUTE granted only to `service_role`. Client `UPDATE` on `pieces`
remains revoked. Allowed transitions are enforced inside the function; an
invalid transition raises SQLSTATE P0001 (`invalid_workflow_transition`).

Stages: `draft → initial_research_pending → initial_research_running →
research_ready → packet_pending → packet_ready → awaiting_student_return →
student_return_received → recognition_running → responses_need_review →
responses_verified → (follow_up_questions_ready → follow_up_research_running
→ follow_up_research_ready)? → final_document_pending → final_document_ready
→ (presentation_pending → presentation_ready)? → complete`. Any stage may
transition to `failed`; `failed → draft` is the only recovery hop.

## New tables (all RLS-enabled, owner-scoped SELECT for the student)

`user_roles`, `courses`, `assignments`, `enrollments`,
`packet_returns`, `page_images`, `recognized_blocks`,
`dictation_segments`, `verification_corrections`, `handwriting_profiles`,
`followup_questions` (≤3 per packet, UNIQUE `(packet_id, position)`),
`final_artifacts`, `student_contributions`, `piece_events`.

Writes to these tables happen only inside edge functions with the exceptions:
`user_roles` (SELECT self), `handwriting_profiles` (self ALL — deletable per
consent), `student_contributions` (self ALL), `courses/assignments`
(professor CRUD), `enrollments` (professor INSERT/DELETE + self SELECT).

## Storage buckets (all private)

- `packet-returns/{user_id}/{return_id}/page-{n}.jpg`
- `dictation-audio/{user_id}/…`
- `final-artifacts/{user_id}/{piece_id}/…`

RLS on `storage.objects` requires the first path segment to equal
`auth.uid()::text`.

## Edge functions

All requests: `POST`, `Authorization: Bearer <supabase-jwt>`, JSON body.
All responses: JSON. Standard error shape: `{ error, code, requestId }`.

| Function | Body | Response | Billable |
| --- | --- | --- | --- |
| `create-student-return-upload` | `{ packetId, returnId?, pages: [{pageNumber?, contentType?}] }` (≤20; `returnId` appends to an existing return — the retake loop — and replaces a failed page with the same `pageNumber`; empty `pages` creates a dictation-only return) | `201 { returnId, uploads: [{pageNumber, storagePath, signedUrl, token}] }` | No |
| `analyze-returned-page` | `{ pageImageId }` | `200 { pageImageId, blocksInserted, quality: {ok, issues: [{code, message}]} }` — `quality.ok=false` means the page needs a retake for the named reasons; blocks carry `linked_question_id` resolved from the packet's questions | No |
| `submit-dictation` | `{ packetId, transcript, returnId?, resolvedTarget?, segmentOrder?, storagePath? }` | `201 { segmentId }` | No |
| `verify-student-responses` | `{ pieceId, corrections: [{blockId?|segmentId?, correctedText, correctedMeaning?}] }` (≤500) | `201 { inserted }` | No |
| `prepare-follow-up-questions` | Suggest mode: `{ packetId, questions: string[] (1..3), suggestRefinements?: boolean }`. Approve mode: `{ packetId, approve: true, questions: [{studentText, approvedText, suggestedText?}] (1..3) }` — writes `status='approved'` + `approved_text` (the gate `run-follow-up-research` requires) while preserving the student's original wording. Each call replaces the packet's question set; refused with `already_researched` once the research pass ran. | `201 { count, approved, hasSuggestions }` | No |
| `run-follow-up-research` | `{ packetId, requestId? }` | `201 { runId, packetId, cost: 2 }` | **2 credits** |
| `create-final-document-job` | `{ pieceId, requestId? }` | `201 { runId, artifactId, cost: 2 }` | **2 credits** |
| `create-presentation-job` | `{ pieceId, requestId? }` | `201 { runId, artifactId, cost: 2 }` | **2 credits** |

Error codes: `invalid_input`, `too_many_pages`, `too_many`, `too_long`,
`invalid_count`, `not_found`, `packet_not_found`, `piece_not_found`,
`no_approved_questions`, `already_researched`, `research_running`,
`insufficient_credits`, `reserve_failed`,
`sign_failed`, `insert_failed`, `recognition_failed`, `env_missing`,
`unhandled`. Idempotency: billable functions accept `requestId`; the same
`requestId` returns the existing runId with HTTP 202.

## Billing summary (docs/BILLING.md)

The three billable functions above reserve credits via `reserve_credits`
BEFORE dispatch; the standard `settle_reservation` / `release_reservation`
lifecycle applies. No new ledger paths, no new prices for existing runs.

## Provenance & no-overwrite guarantees

- `packets.version` + `packets.supersedes_packet_id` — follow-up research
  writes a NEW packet row; the original is never mutated.
- `followup_questions` — `student_text`, `suggested_text`, `approved_text`
  are separate columns. Refinements never overwrite the student's wording.
- `verification_corrections` — distinct from `recognized_blocks`; the raw
  recognition remains inspectable.
- `piece_events` — packet-level audit trail.

## Manual actions still required

1. **Deploy the 8 new edge functions** (triggered via `supabase--deploy_edge_functions`; auto-deploys otherwise).
2. **Regenerate `src/integrations/supabase/types.ts`** — the deploy pipeline handles this on the next migration; verify after deploy.
3. **Add a professor** via a service-role insert into `user_roles` when the first instructor account is real (no self-serve promotion by design).
4. **Confirm the two security-linter warnings** on `has_role` / `advance_workflow_stage` — both are intentional: `has_role` must be callable from RLS policies (documented Supabase pattern); `advance_workflow_stage` EXECUTE is revoked from `authenticated`/`anon` and granted only to `service_role`.

## Known limitations

- `run-follow-up-research`, `create-final-document-job`, and
  `create-presentation-job` now dispatch to the Cursor cloud-agent provider
  and are handled by `cursor-webhook` and `reconcile-runs` on fetch-back.
  The follow-up persistor writes a NEW `packets` row (`version = prior + 1`,
  `supersedes_packet_id = prior`), and the final-artifact persistor uploads
  the DOCX/PPTX binary the agent commits at
  `pieces/<slug>/final/{document.docx|presentation.pptx}` to the private
  `final-artifacts` bucket. The FSM (`workflow_stage`) advances to
  `follow_up_research_ready`, `final_document_ready`, or
  `presentation_ready` on success and `failed` on provider failure.
  Actual DOCX/PPTX rendering runs inside the cloud agent's environment; if
  that environment lacks a DOCX or PPTX library the artifact fetch-back
  raises and the run stays in `awaiting_fetch` until the reconciler retries
  (credits are still held; the 1h `sweepStaleReservations` releases them if
  the run ultimately fails).
- Recognition uses `google/gemini-2.5-flash` via Lovable AI Gateway; low
  confidence blocks (<0.5) are still inserted so verification can act on
  them but downstream code should treat them as unverified.
- `courses/assignments/enrollments` have no seeding endpoint — professor
  role must be granted manually (item 3 above).
