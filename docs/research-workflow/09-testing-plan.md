# Deliverable 13 — Testing Plan

## Functional tests

- **Phase 1 (implemented)**
  - `supabase/functions/_tests/packet.test.ts` (Deno): `buildPacketPrompt`
    content (analysis-first ordering, prohibited generic patterns embedded,
    rubric embedded, output paths); `parsePacketQuestions` /
    `parsePacketAnalysis` validation (bounds, required followup question,
    claim_ref required, generic-prompt rejection, malformed JSON);
    `persistPacketResult` idempotency (duplicate delivery upserts, no
    duplicate question rows).
  - `tests/packet-document.test.ts` (Vitest): packet print builder structure
    (question ids, ruled-line counts per `response_space`, follow-up areas,
    handwriting guidance with the dictation alternative, packet ID,
    student/course fields, HTML escaping, determinism).
  - `tests/print-fidelity.test.ts` (Chromium): packet fixture — question
    blocks consume **zero** S{n}P{m} anchors (PDF anchors equal the
    body-only reference walk), response areas survive pagination without
    clipping, folio and running header intact.
- Later phases add: recognition-pipeline unit tests with fixture images,
  dictation-mapping tests, follow-up refinement tests, DOCX/PPTX structure
  tests (open the generated OOXML and assert styles/alt text).

## Pedagogical tests (question quality)

Run the workflow across at least five disciplines: social science using
public data; law or public policy; science; humanities; business/market
research. For each packet verify:

- every question references actual evidence (a claim id resolvable in
  `packets.analysis`),
- no question matches a prohibited generic pattern,
- rubric scores ≥ 9/12,
- **cross-discipline swap test**: an independent review swaps the question
  sets between two unrelated packets; if any question reads naturally in the
  other packet without meaningful changes, the implementation is rejected.

## Visual and print tests

- Writing space sufficient: ruled lines ≥ 0.35in apart; every question block
  has its declared space; no dense prompt cluster without room to answer.
- Follow-up question areas usable (three separate areas + credibility
  sub-prompts).
- Handwriting guidance and dictation fallback visible in the printed packet.
- Page furniture (packet ID, folio, attribution) present on the PDF;
  grayscale legibility of visuals.
- Inspect regenerated PDFs in `test-artifacts/print/`.

## Recognition tests (Phases 2–4)

- Confidence surfaced per block; low-confidence flagged in verification.
- Student corrections preserved and applied to later pages.
- Quality gate rejects blurred/glare/cropped fixtures with named reasons.
- Multi-page photos only accepted when text height clears the threshold.

## Privacy tests

- RLS: user A cannot read user B's packets, questions, returns, images,
  or profiles (SQL suite, mirrors `supabase/tests/credits.test.sql` style).
- Handwriting-profile deletion removes the profile row and stops adaptation.
- Storage buckets reject cross-folder reads/writes.

## Billing tests

- Packet workflow costs mirror `CREDIT_COST` (client/server drift guard in
  `tests/billing-boundaries.test.ts` continues to pass).
- Follow-up pass reserves 2 credits; failed pass releases the hold (extend
  `_tests/credits.test.ts` in Phase 5).
- Review/print/correction paths perform no reservation.

## Accessibility and mobile tests

- Review screen: 375px first, `min-h-11` touch targets, no horizontal
  scroll, visible focus states.
- Photo upload works on mobile (`capture` attribute, Phase 2).
- DOCX: heading hierarchy, alt text, table headers (Phase 6).
- Print preview remains a fixed Letter sheet on mobile (scroll, not reflow).

## Regression gates (every phase)

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:functions`, `bash scripts/check-migrations.sh`,
`bash scripts/check-secrets.sh`, `bash scripts/check-print-contract.sh`.
