# Deliverable 10 — Clarity Pass (shared vocabulary)

Landed on 2026-07-13 to reconcile the two workflows (`longform` draft and
`research_packet`) into one perceived product without changing schema,
edge functions, or run orchestration.

## The six shared verbs

```
Explore  →  Print  →  Think  →  Return  →  [Review → Follow up →]  Finish
```

Both workflows follow the same spine. The packet workflow adds `Review`
(handwriting confirmation) and `Follow up` (optional second research pass)
between `Return` and `Finish`. Every user-facing surface pulls its stage
labels from these constants.

## Sources of truth

- `src/config/workflow-copy.ts` — the promise, `HOW_IT_WORKS`, mode intent
  copy, `AI_WILL_DO`/`AI_WONT_DO`, credit narrative, stage transitions.
  Every surface imports from here so copy doesn't drift.
- `src/lib/packet-stage.ts` — `STAGE_LABELS`, `STAGE_DESCRIPTIONS`,
  `SHARED_STAGE_LABELS`, `packetStageToShared()`, `draftRunToShared()`,
  `deriveDashboardStage()`.
- `src/config/brand.ts` — one-sentence promise + meta description.

## Rules for future changes

1. New user-facing copy for the loop belongs in `workflow-copy.ts`, not
   inline in a component. Deep pages (`return`, `review`, `followup`,
   `runs`) will migrate as they are touched.
2. New verbs never enter the shared spine without updating `SHARED_STAGES`,
   both mapping functions, and this doc.
3. The Finish stage always names all three real outputs (Word document,
   class presentation, merged draft) somewhere on the surface — never
   erase one because it isn't in the current path.
4. "Artifact", "ingestion", "reconciliation", "rendering", "packet return"
   stay in code and internal docs. In the UI they become plain-language
   equivalents (return, review, finish, etc.).

## Deferred to a follow-up pass

- `return.$packetId`, `review.$returnId`, `followup.$packetId`, and
  `runs.$runId` opening/transition copy — the pages are already reasonable;
  when they're next opened for other reasons, migrate their strings into
  `workflow-copy.ts`.
- Printed return-checklist audit in `src/lib/print-document.ts`.
- Onboarding surface — intentionally out of scope (no new features).