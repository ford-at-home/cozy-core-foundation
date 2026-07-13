
# Clarity Pass: Unified Vocabulary, One Story, Two Depths

Turn the "best of both worlds" framing into shipped copy and light UI reorganization. **No new features, no schema changes, no professor scope, no new stages.** Both workflows keep operating exactly as they do — this pass only makes the user perceive one product. Word-doc and PowerPoint generation stay fully intact as the packet workflow's Finish stage; merged-PR draft stays as the longform workflow's Finish.

## Shared stage vocabulary (single source of truth)

Both workflows get named against the same six/seven verbs. The seventh (`Review` + `Follow up`) applies only to the packet path.

```text
Explore  →  Print  →  Think  →  Return  →  [Review  →  Follow up  →]  Finish
```

- **Explore** — AI gathers research (packet) or drafts in your voice (longform).
- **Print** — Generate the hardcopy with `S{n}P{m}` anchors.
- **Think** — Off-screen, on paper. App shows "waiting for you".
- **Return** — Photograph pages + dictate (packet) or paste/dictate an annotation transcript (longform).
- **Review** — Correct what handwriting recognition read. *Packet only.*
- **Follow up** — Approve up to three questions for another research pass. *Packet only, skippable.*
- **Finish** — Download **Word doc and/or PowerPoint** (packet, via existing `create-final-document-job` + `create-presentation-job`) or approve & merge the revised draft (longform). Both endings preserved.

Codify in `src/lib/packet-stage.ts` as the shared `STAGE_LABELS` (already exists) and add a parallel `DRAFT_STAGE_LABELS` re-using the same six verbs. The draft-run page reads the current substate off `agent_runs.kind` and maps to one of those verbs.

## File-by-file changes

### Landing (`src/routes/index.tsx`)
- Rewrite `HOW_IT_WORKS` to the six shared verbs. Drop workflow-specific nouns from top-level headings.
- Rewrite hero + one-sentence promise to match the shared arc; retain "Leave the screen. Keep the thread."
- Add "What AI will / won't do" (three bullets each) from Phase 5 of the brief.
- The `Finish` copy explicitly names "a Word document, a class presentation, or a revised draft merged to your repo" so a landing visitor sees all three real outputs.
- CTA: "Start a project" → `/new`.

### `/new` (`src/routes/_authenticated/new.tsx`)
- Rewrite the two mode cards using intent framing:
  - **"Draft a piece in my voice"** (`longform`) — ends in a merged draft.
  - **"Study a subject and write from it"** (`research_packet`) — ends in a Word doc and/or PowerPoint.
- Below the toggle, preview the arc: "You'll Explore → Print → Think → Return → Refine → Finish" for longform, or the same with Review + Follow up inserted for packet. Each preview names its final output.
- Rename primary button to **"Start"**.

### Dashboard (`src/routes/_authenticated/dashboard.tsx`)
- Rename "Kind" column → "Stage"; render the shared verb via a new `deriveDashboardStage(row)` helper in `packet-stage.ts` that maps piece + latest run to one of the seven verbs.
- Rename "New draft" → "New project".
- Empty state uses "project".

### Project hub (`src/routes/_authenticated/project.$pieceId.tsx`)
- Already uses `STAGE_LABELS`. Add one-sentence description per stage (new `STAGE_DESCRIPTIONS` map).
- Add transition copy at the top of the active stage card ("What just happened / What's next / You can leave — everything's saved").
- Follow-up card gets an explicit **"Skip follow-up"** secondary action that jumps to Finish.
- **Finish card** headline: "Create your final paper and slides." Body: single primary "Choose what to create" button; clicking reveals both docx and pptx options with per-artifact cost, current status (pending/generating/ready/failed via existing `final_artifacts` rows), and download links exactly as today. No generation logic changes; only visual weight and disclosure.

### Draft-run page (`src/routes/_authenticated/runs.$runId.tsx`)
- Small "Stage" pill mapping current run/piece state to one of the six shared verbs.
- Rename revise-panel textarea heading to **"Return your marks"**.
- Revision-approval panel keeps its "Approve & merge" / "Not quite — mark up & re-dictate" buttons (built last turn); surrounding copy uses shared vocabulary.

### Return page (`src/routes/_authenticated/return.$packetId.tsx`)
- Reframe upload + dictation as one decision: "How would you like to return your work?" with three cards (Upload photos, Dictate, or both). Progressive disclosure.
- Add opening transition copy.
- Rewrite blurred/missing-page recovery messages using Phase 11 template.

### Review page (`src/routes/_authenticated/review.$returnId.tsx`)
- Opening explanation: "We read your handwriting, but it can be ambiguous. Confirm or correct before it feeds the next research pass."
- Keep controls; rewrite section labels to plain language.

### Follow-up page (`src/routes/_authenticated/followup.$packetId.tsx`)
- Opening explanation from Phase 6.
- Explicit **"Skip follow-up and go to Finish"** button at equal visual weight to "Send for research".

### Print (`src/lib/print-document.ts`)
- Verify printed packet ends with a **Return checklist page**: read → respond → dark ink → shorthand legend → up to 3 questions → photograph one page at a time → dictate anything ambiguous → return to the project. Add missing items only.
- Do not touch `S{n}P{m}` anchor logic or `contract/references/MARKUP.md`.

### Brand config (`src/config/brand.ts`)
- Update `brand.meta.description` and `brand.product.descriptor` to the unified one-sentence promise. `brand.product.name` unchanged.

### New shared copy file (`src/config/workflow-copy.ts`)
- Central export for every user-facing string in this pass: stage descriptions, transition messages, credit explanation, "what AI does / doesn't do", empty/error templates. So every surface pulls from one place.

### Docs
- Update `docs/brand/UI-COPY-MAP.md` with new mappings.
- Add `docs/research-workflow/10-clarity-pass.md` recording the six-verb model and reconciliation.

## What this pass does NOT change

- No changes to `pieces.workflow` / `workflow_stage` / `agent_runs.kind` / any schema.
- No changes to Edge Functions, RLS, credit ledger, print CSS, `S{n}P{m}` anchors.
- **No changes to `create-final-document-job` or `create-presentation-job`** — docx and pptx generation preserved exactly.
- No changes to run orchestration, revision PR merge, GitHub integration.
- No professor role, no assignments, no enrollments.
- No onboarding modal or tour. Static copy only.

## Order of work

1. `src/lib/packet-stage.ts` + new `src/config/workflow-copy.ts` — shared vocabulary and copy constants first.
2. `src/routes/index.tsx` + `src/config/brand.ts` — landing and brand meta.
3. `src/routes/_authenticated/new.tsx` — mode framing.
4. `src/routes/_authenticated/dashboard.tsx` — stage column.
5. `src/routes/_authenticated/project.$pieceId.tsx` — transitions, Finish reframe, skip follow-up.
6. `src/routes/_authenticated/return.$packetId.tsx` + `review.$returnId.tsx` + `followup.$packetId.tsx`.
7. `src/routes/_authenticated/runs.$runId.tsx` — draft-run vocabulary alignment.
8. `src/lib/print-document.ts` — printed return checklist audit.
9. `docs/brand/UI-COPY-MAP.md` + `docs/research-workflow/10-clarity-pass.md`.
10. Validation: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; Playwright pass Landing → /new → /project hub confirming shared verbs render and Finish card exposes docx + pptx.

## Validation checklist

- First-time landing visitor can name the six/seven verbs after one read, and knows all three real outputs exist (docx, pptx, merged draft).
- `/new` explains the difference between the two modes in one sentence each.
- Every project-hub stage card answers: what just happened, what's next, can I leave.
- Finish card in the packet hub still generates and downloads both docx and pptx.
- Every credit cost stated at its point of value.
- Every failure state names what happened, what's saved, credits consumed, and one concrete next action.
- Printed packet ends with a self-contained return checklist.

Approve and I'll execute in order.
