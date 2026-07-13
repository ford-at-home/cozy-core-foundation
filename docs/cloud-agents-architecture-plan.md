# Plan v2: markdown-soul-kitchen — UI-first drafting studio on Lovable + Cursor Cloud Agents

> [!NOTE]
> **Historical planning document.** Written 2026-07-11, before the mobile,
> print-fidelity, payments/credits, and Hardcopy Tools brand work merged.
> Kept for design rationale. Where it disagrees with the code, the code wins:
> the product is now branded **Hardcopy Tools**, is **multi-user** with
> per-user credits and Stripe billing (not single-user), iteration happens
> through in-app actions (`piece-action`) rather than GitHub issue labels,
> and some names here (`markdown-soul-kitchen`, `agent_jobs`-era schema in
> the companion research doc) predate the implementation. For the current
> architecture, start at the [README](../README.md).

**Status:** v2, 2026-07-11. Supersedes v1 (same file, git history) after an owner redirect.
**Cursor API facts below are bound to the research in [`docs/cursor-api-research.md`](cursor-api-research.md)** (confidence taxonomy: Documented / Strongly implied / Not established). Anything still unknown is marked `[Unverified]`.

## What changed from v1 (owner decisions, 2026-07-11)

1. **Single-user product.** The app is for the owner. Peers participate through GitHub issue comments — GitHub supplies their identity and notifications. The old multi-tenant framing is gone; RLS stays as hygiene.
2. **Deliverable redefined.** v1 said "prose in the UI; PR is plumbing." Now the pipeline is GitHub-native under the hood — proposal in an **issue thread**, final drafts as **PRs** the owner approves — but the **UI is the cockpit**: the owner works from the app and visits GitHub only at approval moments.
3. **Single repo.** `i-write-too-much` is retired as a dependency. This repo (`cozy-core-foundation`) is: the Lovable app, the Supabase functions/migrations, **and** the content repo the Cursor agent clones. The synthesize contract is vendored at [`contract/`](../contract/README.md); pieces live under `pieces/`.
4. **Voice unchanged:** per-user profile data, injected inline into agent prompts. No voice files anywhere.

## The product experience

1. **Profile** — style questionnaire captured once (placeholder `style_text` until the owner's elicitation questions arrive `[NEEDS INPUT]`), saved permanently.
2. **Compose** — paste research (v1: paste + `.md`/`.txt` attach) → agent authors a brief and synthesizes a **proposal**: the research, cited, in the owner's voice. Posted to a GitHub issue for peer comment; mirrored in the app.
3. **Iterate** — app buttons apply labels: `resynth` → new attempt as an issue comment; `ready` → agent produces the final draft as a **PR**. Owner approves on GitHub (approval moment #1). Merged file lands in `pieces/`.
4. **Print** — app renders the merged piece with the paper-markup format (`src/styles/print.css`, `S{n}P{m}` anchors); Ctrl+P produces the wide-margin artifact for pen annotation.
5. **Annotate & finalize** — owner types (later: dictates) the shorthand notes; a revision run applies them per `contract/references/MARKUP.md`, injects visuals per profile preference, and opens the final PR (approval moment #2). App shows the publishable version: inline hyperlinked citations, inline images, copy-as-rich-text.

## Architecture

```text
Lovable UI (this repo)          — cockpit: profile, research intake, piece dashboard,
    │                             print view, annotation read-back, publish view
    ▼
Supabase Edge Functions (Deno)  — thin idempotent adapters over a durable job
    │                             controller in Postgres (pieces, agent_runs, events)
    ▼
Cursor Cloud Agents REST v0     — execution plane; clones THIS repo, follows contract/,
    │                             writes to pieces/, pushes branch / opens PR
    ▼
Webhooks (Cursor statusChange; GitHub issues/PR events) + scheduled reconciler
    │
    ▼
Postgres state → Supabase Realtime → UI
```

Roles (from the research §6): **this system is the control plane and system of record; Cursor is the execution plane.** DB is the source of truth; webhooks are optimizations; the reconciler is authoritative.

## Verified Cursor API binding (replaces v1 §"[NEEDS INPUT] Cursor API")

All Documented unless noted. Base `https://api.cursor.com`, auth `Authorization: Bearer <crsr_...>`. Errors 400/401/403/404/429/500; rate limits per-team, reset per minute (no numeric for create).

- **Create:** `POST /v0/agents` → **201 synchronously** with `{ id: "bc_...", status: "CREATING", target: { branchName, url, prUrl }, createdAt }`. Payload: `prompt.text` (required), `source.repository` + `source.ref`, `target.autoCreatePr` (+ optional `target.branchName`), `model`, `webhook.url` + `webhook.secret` (≥32 chars).
- **Identifiers:** one durable agent id (`bc_...`). No run id in v0; `external_run_id` column reserved for the v1 run-based API (named in Cursor's changelog; schemas not established — build v0, store raw statuses for forward-compat).
- **Status:** `GET /v0/agents/{id}` → status + `target.prUrl/branchName` + `summary`. Poll path for the reconciler.
- **Status enum (partial):** `CREATING`, `RUNNING`, `FINISHED`, `ERROR`. `CANCELLED` **not established**. Rule: unknown raw status → non-terminal hold, never terminal.
- **Cancel:** `POST /v0/agents/{id}/stop` = pause, returns no cancelled status → our `cancelled` state is set only after reconciliation confirms (`cancel_requested` → `cancelled` | `raced`).
- **Follow-up:** `POST /v0/agents/{id}/followup`; one active run per agent (409 `agent_busy`, strongly implied). We don't use follow-ups (also a documented privilege-escalation surface for teams).
- **Webhook:** only `statusChange`, fired on `FINISHED`/`ERROR` — **no progress events in v0**. HMAC-SHA256 over the **raw body**; headers `X-Webhook-Signature: sha256=<hex>`, `X-Webhook-ID` (dedup key), `X-Webhook-Event`; `User-Agent: Cursor-Agent-Webhook/1.0`. At-least-once, retried on non-2xx, **no ordering guarantee**. Receiver: JWT verification disabled, verify before parse, dedup on `X-Webhook-ID`, monotonic state application, ack 2xx fast.
- **Idempotency: none in the vendor API (confirmed absent).** App-side is the only mechanism: unique idempotency key, insert row **before** the POST, `dispatch_unknown` on ambiguity, reconciler lists/matches agents **before** any re-create. Never blind-retry create (double bill + duplicate branch).
- **Artifacts:** `GET /v0/agents/{id}/artifacts` (15-min presigned S3 URLs; 300/min). `[Unverified]` whether written repo files appear there — not on our critical path; the PR/branch is the retrieval mechanism, and issue-comment content is fetched from the branch by the control plane.
- **Repo binding:** repos connect via the Cursor GitHub app; `GET /v0/repositories` lists them (1/user/min). This repo must be connected once, manually (owner runbook item).
- **Security:** isolated VMs; egress modes + allowlist; Runtime/Build secrets via Cursor's Secrets tab only. The agent environment receives **no secret from us** — prompt in, branch out.

**Still [Unverified] after research:** full status enum; v0→v1 schema stability; base commit SHA on create; billing unit + numeric create rate limit; `X-Webhook-ID` stability across retries (dedup + monotonic guard covers both cases); Lovable cron delivery guarantees (smoke-test in Phase D).

## Repo layout (this repo, single)

```text
cozy-core-foundation/
├── contract/                # vendored synthesize contract (see contract/README.md)
├── pieces/<slug>/           # one directory per piece (agent-written, PR-merged)
│   ├── research/*.md        # source materials (control plane commits these at kickoff)
│   ├── brief.md             # agent-authored from research + inline voice + goal
│   ├── proposal.md          # the issue-thread artifact (also posted as comment)
│   ├── draft.md             # the "ready" final draft (PR #1)
│   ├── final.md             # post-annotation publishable version (PR #2)
│   └── notes/{to-research,tighten,unresolved}.md
├── src/                     # Lovable app (UI surfaces above)
├── supabase/{functions,migrations}/
└── docs/                    # this plan + cursor-api-research.md
```

Trade-off, accepted by the owner: agent PRs to this repo trigger Lovable rebuilds even for content-only merges. Fine at n=1; revisit with a separate pieces repo only if it hurts.

## Data model

```text
profiles        user_id (pk = auth.uid()), style_text, created_at, updated_at   [RLS: own row]

pieces          id, user_id, slug (unique), title, stage                        [RLS: own rows]
                stage: research → proposed → iterating → drafted → printed
                       → annotating → finalized
                issue_number, draft_pr_url, final_pr_url, created_at, updated_at

agent_runs      id, user_id, piece_id, kind ('research'|'proposal'|'resynth'|'draft'|'revision'),
                status, idempotency_key (unique), input jsonb,
                external_agent_id (Cursor), external_run_id (Parallel), external_raw_status,
                branch, result jsonb, error, cancellation_status,
                created_at, dispatched_at, completed_at                          [RLS: own rows]

                kind='research' is executed by Parallel AI (Task API), not Cursor:
                start-workflow accepts {topic} instead of {research}, submits the
                task, and the reconciler polls it. On completion the report (with
                provenance frontmatter) is stored on the run and a 'proposal' run
                is CHAINED (idempotency key compose:<user>:research:<runId>) with
                the report injected as RESEARCH — so the compose agent commits it
                to pieces/<slug>/research/research.md, the versioned copy.

agent_run_events id, run_id, source ('edge'|'cursor-webhook'|'github-webhook'|'reconciler'),
                external_event_id, event_type, payload jsonb, received_at,
                unique(run_id, external_event_id)                                [RLS: own rows via run]
```

**State machine** (v1's, plus what the API reality forces):

```text
requested → dispatching → queued → running → awaiting_fetch → completed
                ↘ dispatch_unknown               ↘ failed
running → cancel_requested → cancelled | completed (raced)
```

Mapping: `CREATING`→queued, `RUNNING`→running, `FINISHED`→awaiting_fetch (→completed once result content is stored), `ERROR`→failed, unknown→hold. `awaiting_fetch` = terminal success observed, content not yet pulled from the branch/PR. Realtime enabled on `pieces` and `agent_runs`.

## Flows (contracts)

**Compose (edge `start-workflow`, evolved):** verify JWT → body is `{ research, goal, requestId }` only (server resolves repo/ref/model/prompt; never from browser) → read profile `style_text`, refuse if empty (contract rule) → insert `pieces` + `agent_runs` row with idempotency key derived from `requestId` (existing key → return existing run) → `POST /v0/agents` with the compose prompt (contract pointer + inline voice + research + goal; `autoCreatePr: false` for proposal runs) → persist `bc_...` id, status queued → **202**. Ambiguity → `dispatch_unknown`, no retry.

**Completion (webhook + reconciler):** `cursor-webhook` edge fn (JWT off) verifies/dedups/acks; flips run to `awaiting_fetch`/`failed` monotonically. Reconciler (scheduled) polls non-terminal runs via `GET /v0/agents/{id}`; resolves `dispatch_unknown`; is the authority. On `awaiting_fetch`: control plane fetches the written files from the run's branch (GitHub contents API, server-side app credential), stores in `result`, posts proposal as issue comment (GitHub App), flips `completed`. Realtime → UI.

**Iterate:** app buttons → edge fn applies `resynth`/`ready` label via GitHub App. GitHub webhook receiver ingests label events (idempotent — labels toggle and deliveries repeat): `resynth` dispatches a new proposal run (result → new issue comment); `ready` dispatches a draft run with `autoCreatePr: true`. PR merge event advances the piece stage.

**Annotate:** UI transcript → revision run (same machinery, kind `revision`, prompt includes `MARKUP.md` + transcript + merged draft) → final PR + publish view.

**GitHub credentials:** one GitHub App installed on this repo only; edge functions mint installation tokens server-side. The agent VM never holds any GitHub or Supabase credential (Cursor's own GitHub app handles clone/push/PR).

## Requirements kept from v1 (unchanged and still binding)

Idempotency + `dispatch_unknown`; secret hygiene (no service-role key / DB creds / long-lived PATs anywhere near the agent; treat prompts and repo content as untrusted); server-side authorization; provider adapter isolating vendor shapes; append-only event log with raw payloads; "agent done ≠ business done"; cancellation + kill switch; don't log `style_text` wholesale.

## Build phases

- **A — Profiles (no external calls).** `profiles` table + RLS, profile editor UI, composer reads style from profile; browser stops sending voice.
- **B — Job controller + adapter (no external calls).** `pieces`/`agent_runs`/`agent_run_events` migrations, state machine, idempotent edge fn returning 202, `CodingAgentProvider` interface + stub, deno tests.
- **C — Real dispatch.** Cursor provider over REST v0; compose prompt builder (contract + inline voice + research); live smoke test.
- **D — Completion.** `cursor-webhook` receiver, scheduled reconciler, branch fetch-back, issue posting via GitHub App. Owner runbook: connect repo to Cursor GitHub app, install our GitHub App, set secrets (`CURSOR_API_KEY`, `CURSOR_WEBHOOK_SECRET`, GitHub App creds), configure repo webhook.
- **E — Iterate + annotate UI.** Piece dashboard, resynth/ready buttons, GitHub webhook receiver, print view, annotation read-back, publish view (rich-text copy; visuals as hosted images `[Unverified]` LinkedIn paste behavior — test manually).
- **F — Harden.** Kill switch, retention, secret review.

## Explicit unknowns

`[NEEDS INPUT]` style-elicitation questions (placeholder `style_text` until then). `[Unverified]` items listed under the API binding above. `[Open]` visuals format (Mermaid vs generated raster) — decide in E with the questionnaire.
