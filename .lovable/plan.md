
## Reframed

The dictation-driven annotation return **is** the input to `revise`. Today that input is a plain textarea on the draft-run page. The plan is to make it a real capture flow, once, before the revision run kicks off. The revision panel's job stays narrow: approve, detect external merges, and if the revision is off — go back and dictate more.

## The intended loop (make it visible in copy and UI)

1. Draft run completes → **Print draft** (already works).
2. Mark up on paper.
3. **Dictate the markup** into the draft-run's revise panel → Revise (1 credit) → revision PR.
4. Revision run completes → Approve & merge, or return to step 3 with another dictation pass.
5. Merged → piece is finalized.

No new run kinds, no schema changes. `revise` accepts the transcript in its existing `feedback` field.

## Plan

### 1. Draft-run: dictation as the primary annotation input

Edit `ActionsPanel` in `src/routes/_authenticated/runs.$runId.tsx`, the `isDraft` branch (lines 455–490). Reuse `useDictation` from `src/hooks/use-dictation.ts` exactly as the profile page does — it already handles mic permissions, WAV encoding, `/api/transcribe`, retry, and error copy.

- Add a **Dictate** button above the textarea:
  - Idle: "🎙 Dictate annotations"
  - Recording: "■ Stop (0:12)" with elapsed timer.
  - Transcribing: "Transcribing…" (disabled).
  - On success, **append** the returned text to `transcript` (with a leading newline if the box isn't empty), never overwrite.
  - Show `useDictation`'s `error` + Retry inline; do not eat errors.
- Keep the textarea editable — the user often cleans up "S2P1" anchor callouts by hand after dictating.
- Update the helper copy:
  *"Print this draft, mark it up on paper, then dictate what you wrote — anchors like 'S2P1' and marks like 'mark three: cut'. Revise reconciles them into the final version."*
- Optional (nice): store `lastBlob` reference so the same audio can be re-transcribed via Retry without re-recording — `useDictation` already exposes this, just wire the button.

Server-side: **no changes.** `piece-action`'s `revise` branch already reads `feedback`, builds `buildRevisionPrompt`, and dispatches. The transcript arrives at the agent identically whether typed or dictated.

### 2. Revision-run panel: approve, or send it back to be re-dictated

Rewrite `RevisionApprovalPanel` (lines 516–620) so it has three states:

**a. Not yet merged** (default)
```
Final version produced.
[ Approve & merge ]        [ Not quite — mark up & re-dictate ]

View PR on GitHub ↗ · Refresh status
```
- **Approve & merge** — unchanged; calls `approveRevisionPr`.
- **Not quite — mark up & re-dictate** — links to `/print/$runId` (this revision) and then navigates back to the *draft* run's revise panel with a small banner: *"Dictate your annotations on this revision to produce the next version."* Simplest wiring: the button goes to the draft run (found by looking up the piece's most recent `kind='draft'` completed run) with `?fromRevision=<runId>`; the draft page reads that param and scrolls to the dictation panel.
  - Alternative if you'd rather keep the input attached to the revision: let `piece-action`'s `revise` accept a prior-kind of `revision` (spot-check confirms it already does — no code change needed, it only rejects `research_packet` and requires a completed prior run). Then the revise panel could live directly on the revision run page too. Pick one; I'd default to keeping revise on the draft page so there's one place users learn the flow.

**b. Merged** (unchanged content, plus one CTA)
```
Approved and merged {ts}. The final version is on the main branch — copy the piece from the tabs above wherever it's going.
View merged PR on GitHub ↗
[ Start a new piece → /new ]
```

### 3. Detect external GitHub approvals

Two additions, independent of the merge button:

**a. Realtime + focus refresh.** In `RevisionApprovalPanel`, subscribe to `pieces` UPDATE for this `pieceId` (mirrors the existing `agent_runs` channel pattern in the same file) and re-read `final_pr_merged_at` on `document.visibilitychange`. Flips the UI as soon as anything stamps the column.

**b. Passive status check.** Extend `supabase/functions/approve-revision/index.ts` to accept `{ runId, mode: "status" }`: do the same PR lookup + "if merged, stamp `final_pr_merged_at` + advance stage + log event" branch it already has, but skip the `PUT /merge` call. Expose as `checkRevisionPrStatus` in `src/lib/pieces.functions.ts`. Panel calls it on mount, on focus, and behind a small "Refresh status" link. Idempotent, free, no credit spend.

This covers the "user merged on GitHub" case without needing a webhook. A GitHub App / webhook stays out of scope.

## Technical notes

- **Files changed**
  - `src/routes/_authenticated/runs.$runId.tsx` — add dictation to `ActionsPanel` (isDraft), rewrite `RevisionApprovalPanel` with realtime + focus refresh + "not quite" CTA + post-merge new-piece CTA.
  - `src/lib/pieces.functions.ts` — add `checkRevisionPrStatus` server fn.
  - `supabase/functions/approve-revision/index.ts` — accept `mode: "status"` to short-circuit before the merge PUT.
- **No schema changes**, **no new secrets** (`GITHUB_TOKEN` and `LOVABLE_API_KEY` already present), **no new run kinds**, **no new billable actions** — the second dictation pass is just another `revise` (1 credit).
- **Reuse, don't rebuild.** `useDictation` + `/api/transcribe` are the exact same pieces the profile page and packet-return dictation use. No new server route.
- **Dictation credits** are workspace AI credits, separate from generation credits — `useDictation` already surfaces that copy on 402.
- **Existing packet-workflow dictation** (return upload, page OCR, `submit-dictation`) is untouched — that's the other workflow and is not what this piece is on.

## Out of scope

- GitHub webhook for instant external-merge detection (polling + focus covers it).
- Auto-closing the prior open revision PR when a new revise fires.
- Attaching the actual audio recording to `agent_runs.input` for later replay (transcript is what the agent needs).
