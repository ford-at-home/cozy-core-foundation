# Deliverable 12 — Data Model, APIs, Job States, and Provenance

## Principles

- Reuse the existing orchestration: `pieces` + `agent_runs` + the run state
  machine (`_shared/state.ts`) own every job; new tables hold domain data,
  not job state.
- RLS in the same migration as every new table. Controller-ish state
  (packet generation) is written by Edge Functions with the service role;
  genuinely user-editable content (question text, review status) is
  client-writable under owner-scoped RLS, like `profiles`.
- Traceability: a final paragraph must be attributable to evidence, student
  response, student dictation, follow-up research, system synthesis, or a
  documented combination.

## Entities

### Phase 1 (implemented)

| Entity | Table / location | Notes |
| --- | --- | --- |
| Research project | `pieces` (+ `workflow` column: `longform` \| `research_packet`) | existing table extended |
| Research inquiry / claims / evidence / methods / uncertainties / stakeholders / local validation / follow-up opportunities | `packets.analysis` (JSONB, schema in deliverable 2) | validated on fetch-back |
| Printable packet + packet version | `packets` (`piece_id`, `run_id` unique, `version`, `status: generated → reviewed`) | body markdown stays in `agent_runs.result` (`post.md`), like all pieces |
| Tailored question / follow-up question section / response field | `packet_questions` (`position`, `function`, `claim_ref`, `prompt`, `guidance`, `response_space`, `locked`, `source`, `edited`) | user-editable under RLS |
| Packet generation job | `agent_runs` with `kind = 'packet'` | same state machine, no new states |

### Phases 2–4

| Entity | Table |
| --- | --- |
| Packet return (one submission attempt) | `packet_returns` (packet_id, status, created_at) |
| Uploaded page image | `page_images` (return_id, storage_path, page_number, quality jsonb, status) |
| Recognized handwriting block | `recognized_blocks` (page_image_id, location, text, confidence, annotation_type, interpretation_confidence, linked_question_id, linked_anchor) |
| Dictation segment | `dictation_segments` (return_id, transcript, resolved_target, order) |
| Verification correction | `verification_corrections` (block_id/segment_id, corrected_text, corrected_meaning, created_at) |
| Handwriting profile | `handwriting_profiles` (user_id unique, profile_text, consent_at, updated_at) — deletable |

### Phase 5

| Entity | Table |
| --- | --- |
| Follow-up question | `followup_questions` (packet_id, student_text, suggested_text, approved_text, status: submitted → refined → approved → researched) |
| Follow-up research job | `agent_runs` with a follow-up research kind; new packet row `version = n+1`, `supersedes_packet_id` |
| Revised finding | encoded in the revised packet's `analysis` with `origin: original \| followup` and `change: confirmed \| complicated \| narrowed \| challenged` |

### Phases 6–8

| Entity | Table |
| --- | --- |
| Student reflection / style sample | `student_contributions` (packet_id, kind, text, source: handwriting \| dictation \| direct) |
| Final Word artifact / presentation / generated visual | `final_artifacts` (piece_id, kind: docx \| pptx \| visual, storage_path, status, provenance jsonb) |
| Course / assignment / enrollment | `courses`, `assignments`, `enrollments` (+ professor role) |
| Activity record | `agent_run_events` (existing) + packet-level events |
| Credit reservation / settlement | existing `credit_reservations` / `credit_ledger` — unchanged |

## API surface

### Phase 1 (implemented)

| Operation | Path | Auth |
| --- | --- | --- |
| Start packet workflow | `start-workflow` Edge Function, `workflow: "research_packet"` in body | JWT; reserves credits before dispatch |
| Fetch-back + persistence | `cursor-webhook` / `reconcile-runs` → `_shared/packet.ts` `persistPacketResult` | service role; idempotent upserts (`packets.run_id` unique, `packet_questions (packet_id, position)` unique) |
| Read packet + questions | client Supabase reads (RLS owner-scoped) via `src/lib/packets.ts` | JWT |
| Edit / lock / add questions; approve packet | client Supabase writes under RLS (question fields; `packets.status` via column-scoped grant) | JWT |
| Print packet | client-side `buildPacketPrintDocument` (free, no server call) | — |

### Later phases (planned)

| Operation | Mechanism |
| --- | --- |
| Upload page images | client → `packet-returns` bucket (folder-scoped RLS) |
| Quality check + recognition | new `packet-return` Edge Function (JWT, ownership-checked) |
| Dictation | existing `/api/transcribe` + segment mapping server fn |
| Verification writes | RLS-scoped tables (corrections are user content) |
| Follow-up research | `piece-action`-style Edge Function action reserving 2 credits |
| DOCX / PPTX generation | server-side generation job writing to `final-artifacts` |

## Job states

No new run states. Every generation job is an `agent_runs` row moving
through `requested → dispatching → (queued | running | dispatch_unknown) →
awaiting_fetch → completed | failed | cancelled`. Packet persistence happens
at the `awaiting_fetch → completed` boundary, exactly where existing piece
fetch-back happens, and is idempotent so webhook/reconciler races and
redeliveries are safe.

## Provenance relationships

```
research report (parallel run)
  → packets.analysis (claims C*, evidence E*, methods M*, …)
      → packet_questions.claim_ref
          → student responses (recognized_blocks / dictation_segments)   [Phase 2+]
              → verification_corrections                                  [Phase 2+]
                  → followup_questions → follow-up run → packets v(n+1)   [Phase 5]
                      → student_contributions → final_artifacts.provenance [Phase 6+]
```

Each hop is a foreign key or a stable id reference inside a validated JSONB
document, so any final paragraph can be traced back to its origins.
