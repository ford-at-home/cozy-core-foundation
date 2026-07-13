# Backend Capability Matrix — Research Workflow

Source of truth for what already exists in the deployed Supabase project and
what remains to be built for research-workflow Phases 2–8. Derived from the
current state of `supabase/migrations/`, `supabase/functions/`, `docs/BILLING.md`,
`docs/ARCHITECTURE.md`, and live schema (`agent_runs`, `pieces`, `packets`,
`packet_questions`, `credit_*`, `stripe_*`, `profiles`, `sessions`, `inferences`).

Status legend: **complete** · **partial** · **schema-only** · **function-only** ·
**documented-only** · **missing** · **contradictory** · **inaccessible**.

## 1. Projects & assignments

| Capability | Status | Notes |
| --- | --- | --- |
| Research project row | complete | `pieces` table; `workflow` column distinguishes `longform` vs `research_packet`. |
| Student ownership | complete | `pieces.user_id` + owner-scoped RLS; client INSERT/UPDATE/DELETE revoked. |
| Course / assignment linkage | missing | No `courses`, `assignments`, `enrollments` tables. `pieces.assignment_id` absent. |
| Professor role | missing | `app_role` enum has only user/admin variants — no `professor`. |
| Workflow stage (authoritative FSM) | partial | `pieces.workflow` is an input flag, not a stage. `agent_runs.status` covers per-run FSM via `_shared/state.ts` but nothing tracks packet-level stage across return/verify/followup/final. |

## 2. Initial research

| Capability | Status | Notes |
| --- | --- | --- |
| Research pass dispatch | complete | `start-workflow` → `agent_runs` (kind='research'|'packet') → provider. |
| Structured claims/evidence/methods/uncertainties | schema-only | Stored in `packets.analysis` JSONB (validated on fetch-back in `_shared/packet.ts`). No relational tables — acceptable per deliverable-12 design; do NOT relationalize in this task. |
| Provenance | complete | `packets.run_id` unique → links each packet version to its generating run. |

## 3. Tailored questions

| Capability | Status | Notes |
| --- | --- | --- |
| Question row per packet | complete | `packet_questions (position, function, claim_ref, prompt, response_space, source, edited)`. |
| Owner editable under RLS | complete | Column-scoped RLS; owner UPDATE. |
| Generation contract | complete | Generated during packet fetch-back via `_shared/packet.ts`. |
| Professor approval state | missing | No `approved_by`/`approved_at` — only needed if professor role ships. |

## 4. Printable packet

| Capability | Status | Notes |
| --- | --- | --- |
| Packet row + versioning | complete | `packets (version, supersedes_packet_id, status)`. |
| Body markdown | complete | Lives in `agent_runs.result.post.md`. |
| Client-side print | complete | `buildPacketPrintDocument` in `src/lib/print-document.ts`. |
| Packet PDF storage | not needed | Print is client-side; no server rendering. |

## 5. Returned student work (Phase 2)

| Capability | Status | Notes |
| --- | --- | --- |
| `packet_returns` | missing | — |
| `page_images` | missing | — |
| `recognized_blocks` | missing | — |
| `dictation_segments` | missing | — |
| `verification_corrections` (distinct from raw recognition) | missing | — |
| `handwriting_profiles` | missing | — |
| Private `packet-returns` bucket | missing | Only `research-attachments` exists. |
| Private `dictation-audio` bucket | missing | — |
| Signed upload flow | missing | No `create-student-return-upload`. |
| Recognition orchestration | missing | No `analyze-returned-page`. |
| Dictation orchestration | missing | `/api/transcribe` route exists but not wired to workflow. |
| Verification write path | missing | No `verify-student-responses`. |

## 6. Follow-up research (Phase 5)

| Capability | Status | Notes |
| --- | --- | --- |
| `followup_questions` (≤3, original/suggested/approved preserved) | missing | — |
| Follow-up run kind | missing | `agent_runs_kind_check` lacks `followup_research`. |
| Revised packet writes new version | complete (mechanism) | `packets.version` + `supersedes_packet_id` already exist and are idempotent. |
| `prepare-follow-up-questions` fn | missing | — |
| `run-follow-up-research` fn | missing | Billing: reuse `reserve_credits`. |

## 7. Final artifacts (Phase 6)

| Capability | Status | Notes |
| --- | --- | --- |
| `final_artifacts` | missing | — |
| `student_contributions` | missing | — |
| `final-artifacts` bucket | missing | — |
| DOCX generation job | missing | Contract-only in this task. |
| PPTX generation job | missing | Contract-only. |
| Run kinds `final_docx` / `final_pptx` | missing | Extend `agent_runs_kind_check`. |

## 8. Activity history

| Capability | Status | Notes |
| --- | --- | --- |
| Per-run events | complete | `agent_run_events`. |
| Packet-level events | missing | Need `piece_events` for packet_downloaded, pages_uploaded, verification_completed, followups_approved, final_generated. |

## 9. Billing & credits

| Capability | Status | Notes |
| --- | --- | --- |
| Append-only ledger + deny-all stripe_events + SECURITY DEFINER money fns | complete | See docs/BILLING.md. |
| Reservation lifecycle | complete | `reserve_credits` / `settle_reservation` / `release_reservation`. |
| Wiring for new billable ops | missing | Follow-up research, final DOCX, final PPTX need reservation calls. Prices TBD. |

## 10. Secrets

| Secret | Status | Used for |
| --- | --- | --- |
| `LOVABLE_API_KEY` | present | AI Gateway (multimodal recognition). |
| `PARALLEL_API_KEY` | present | Deep-research provider. |
| `CURSOR_API_KEY`, `CURSOR_WEBHOOK_SECRET` | present | Cursor background agents. |
| `OPENAI_API_KEY` | present | Transcription. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | present | Billing. |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | present | Service-role edge writes. |
| `AGENT_IMAGE_SECRET` | present | Signed image URLs. |

No new secrets required by Phases 2–6 as scoped.

## 11. Storage buckets

| Bucket | Status | Purpose |
| --- | --- | --- |
| `research-attachments` | present, private | Existing research uploads. |
| `packet-returns` | missing, private | Photographed pages. |
| `dictation-audio` | missing, private | Optional dictation. |
| `final-artifacts` | missing, private | DOCX/PPTX/visuals. |

## Net-new by phase

- **B** — Workflow-stage FSM column + validation trigger on `pieces` (server-only writes).
- **C** — `professor` role + `courses`/`assignments`/`enrollments` + `pieces.assignment_id`.
- **D** — 6 tables + 2 storage buckets + 4 edge functions for return & recognition.
- **E** — 1 table + 1 CHECK extension + 2 edge functions for follow-up (1 billable).
- **F** — 2 tables + 1 storage bucket + 2 edge functions for final artifacts (2 billable).
- **G** — `piece_events` table.
- **H** — Deno tests, RLS SQL tests, types regeneration, contracts doc.

No existing edge function requires substantive modification. The only additive
change to existing DDL is extending `agent_runs_kind_check` to accept
`followup_research`, `final_docx`, `final_pptx`, done in Phases E/F alongside
the new functions.
