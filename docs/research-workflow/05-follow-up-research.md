# Deliverables 4 & 8 — Follow-Up Research and Revised Packet

Phase 5. Defined here so the Phase 1 data model (`packets.version`,
`packet_questions.function = 'followup'`) supports it without rework.

## Submitting follow-up questions

After verification, the student submits **up to three** follow-up research
questions, sourced from handwritten responses, dictation, annotations,
direct entry, or system-suggested options (the analysis's
`followup_opportunities`) the student explicitly approves.

More than three submitted → the student ranks and picks three; the rest stay
in the activity record.

## Question quality check and refinement

Each question is scored 0–2 on six dimensions; refinement is suggested below
9/12:

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Specificity | Broad topic | Narrow area | Precise relationship, population, period, or claim |
| Researchability | Not answerable | Partly answerable | Clearly answerable with identifiable evidence |
| Relevance | Weak connection | Related | Directly tests or extends a major finding |
| Authority | Opinion-seeking | General sources | Points toward authoritative evidence |
| Scope | Unbounded | Some limits | Realistic for one research pass |
| Consequence | Low value | Useful | Could materially change interpretation or action |

Refinement is **visible and consensual**: the suggested narrower version is
shown beside the student's wording; the student approves, edits, or keeps
their original. The student's question is never rewritten invisibly.

Example — weak: "How will AI change jobs?" → suggested: "Between 2022 and
2026, did employment decline faster in administrative occupations with high
exposure to large language models than in comparable occupations with lower
exposure, after accounting for broader hiring conditions?"

## Second research pass

One focused Parallel research run per follow-up pass (all approved questions
in one pass). The research prompt carries:

- the original inquiry and the original report (preserved, not restarted),
- the approved follow-up questions,
- the instruction to seek **authoritative evidence** (peer-reviewed
  research, official statistics, government reports, legal authorities,
  institutional data, professional associations, credible primary documents,
  authoritative technical documentation, reputable archives — weighted by
  discipline), and
- the instruction to state, per question, whether new evidence **confirms,
  complicates, narrows, or challenges** the original findings.

Provenance: newly added sources, updated findings, changed conclusions,
unresolved questions, and conflicting evidence are each explicitly marked.
Prior findings are never overwritten without explanation. No fabricated
authority.

## Revised packet

A follow-up pass produces a new `packets` row (`version = n+1`,
`supersedes_packet_id` linkage) whose body distinguishes: original findings,
student-raised questions, new evidence, changed interpretations, findings
that remained stable, findings that became less certain, and questions still
unanswered.

Render options (student's choice; no forced full reprint):

- full revised packet,
- concise addendum (new/changed sections only),
- replacement pages (page ranges that changed, printed with the same packet
  ID and a `rev` marker),
- change summary (one–two pages).

The interface explains page replacement and packet order.

## Credit and cost behavior

Verified against the current implementation (`_shared/credits.ts`,
`docs/BILLING.md`) before defining:

| Action | Cost | Mechanism |
| --- | --- | --- |
| Initial packet from pasted research | 1 credit (`compose`) | reserve at dispatch → settle on completion → release on failure |
| Initial packet from a topic (deep research + packet) | 2 credits (`research`) | one hold covers the chained packet run via `parent_run_id` |
| Follow-up research pass (up to three approved questions) | 2 credits (research-class) | same reserve/settle/release lifecycle; failed pass releases the hold — the student is not charged |
| Question review, editing, locking, approving | Free | RLS-scoped table writes, no run |
| Re-rendering / reprinting / Save-as-PDF | Free | client-side render of existing results |
| Photo upload, recognition, retakes, corrections, verification | Free | provider costs recorded as inferences (cost accounting), not user credits |
| Downloading an existing artifact | Free | storage read |

The UI states the credit cost before any billable dispatch (the existing
`/new` pattern). No hidden or surprising charges.
