# Plan: markdown-soul-kitchen on Lovable via Cursor Cloud Agents

**Status:** Design, pre-implementation. Written 2026-07-11 as a handoff for a fresh session.
**Supersedes:** the local-runtime "hosted Node worker" approach (see [§7 What this replaces](#7-what-this-replaces)).
**Depends on two inputs the owner is providing:**
1. **[NEEDS INPUT] Cursor Cloud Agents REST API research** — endpoints, run/agent model, webhook signing, idempotency support, billing unit, rate limits. Do **not** invent these; wait for the owner's research or verify against current Cursor docs.
2. **[NEEDS INPUT] Style-elicitation questions** — the set of clever free-text prompts that capture a user's writing style into their profile. Owner will provide.

> **Read this first if you are the executing model.** This document is self-contained. It assumes no memory of the prior session. It describes *what to build and why*, the decisions already locked, and the explicit unknowns. Where something is unverified or awaiting input, it is marked `[Unverified]` or `[NEEDS INPUT]`. Honor those markers — they are load-bearing.

---

## 1. What the product is

`markdown-soul-kitchen` is a long-form writing tool where **voice, persona, and intent are structured inputs**, not an afterthought. The core operation, `compose`:

- User pastes **research** (raw notes, links, source material).
- User's **voice/style** is applied (see §4 — this is now profile data, not a file).
- Optionally a **goal/steer** shapes persona + throughline.
- The system **authors a writing brief** from those inputs, then **synthesizes a finished piece** faithful to the brief.
- The deliverable is **prose the user reads in the browser** (`post.md`), plus supporting artifacts (`tighten.md`, `to-research.md`, `unresolved.md`).

The synthesis contract lives at `packages/markdown-soul/skills/synthesize/SKILL.md` and the brief shape at `packages/markdown-soul/references/BRIEF.template.md` (both in the `i-write-too-much` repo). These are the authoritative behavior specs the agent must follow.

---

## 2. The architecture (redirected)

```text
Lovable UI (React / TanStack, hosted by Lovable)
    │  authenticated user submits { research, goal }; voice comes from their profile
    ▼
Supabase Edge Function (Deno)  ── thin, fast, idempotent adapter
    │  auth JWT → resolve profile/policy → insert job row → dispatch → 202
    ▼
Cursor Cloud Agents REST API   ── [Unverified] exact surface, owner is researching
    │
    ▼
Cursor-managed VM
    │  clones a GitHub repo containing the synthesize contract + plugin content
    │  runs the compose flow (brief authored from research + inline voice, then synthesize)
    │  writes post.md + artifacts; pushes a branch (plumbing, not the product)
    ▼
Completion signal: webhook (primary) + scheduled reconciler (fallback)
    │
    ▼
Fetch generated post.md content back → store on job row → Supabase Realtime → UI renders prose
```

**Key principle (from the redirect):** the Edge Function is only the *public API boundary*. The real system is a **durable, policy-enforcing job controller** backed by Postgres. "Calling Cursor is the easy part; safely turning a button click into authorized autonomous execution is the architecture."

**Why not run the SDK in the Edge Function:** `@cursor/sdk` declares Node ≥ 22.13 and ships Node-specific modules + platform binaries; a Deno edge isolate is an unsupported gamble. Edge functions are also time-boxed (≈150s idle / 150s wall on Free, 400s paid, 256MB, ~2s CPU/req) — far shorter than a multi-minute agent run. So the edge function **dispatches and returns**; it never holds the run open.

**Why cloud runtime, not local runtime:** the local SDK runtime needs a durable filesystem, processes, and a working directory. That was the old "worker" approach (§7). Cloud Agents provide the repo clone, sandbox, tools, and durable execution — and require no box the owner has to operate.

---

## 3. What already exists (in the `cozy-core-foundation` Lovable repo)

The Lovable foundation is built and merged to `main`. Reusable as-is:

- **Auth** — Supabase auth, protected `_authenticated` layout, `/auth` gate.
- **`workflow_runs` table + RLS** — users see only their own rows (`auth.uid() = user_id`), with `SELECT/INSERT/UPDATE` policies. **Will be renamed/reshaped** toward the model in §5.
- **`start-workflow` edge function** — already: validates JWT, inserts a run row as the user (service-role), returns `{ runId }`, and (when `WORKER_URL` is set) POSTs to an external service. **This is the dispatch seam to repoint at the Cursor API.**
- **`new.tsx`** — composer form (research / voice / goal) → calls `startWorkflow` server fn → navigates to run detail.
- **`runs.$runId.tsx`** — run-detail page, **subscribes via Supabase Realtime**, renders status + output tabs with `MarkdownView`.
- **`dashboard.tsx`** — lists recent runs, rows link to detail.
- **`MarkdownView.tsx`** + scoped `.markdown-output` styles — renders returned prose.
- **Realtime migration** — `workflow_runs` added to the `supabase_realtime` publication.

The `202 → job row → Realtime → detail page` skeleton is exactly what §2 needs. Keep it; change *what it dispatches to* and *what lands on the row*.

---

## 4. Voice model (locked decision)

**Voice is per-user profile data, injected inline into the agent prompt. It is NOT a file and NOT in any repo.**

- Each authenticated user has a **profile** capturing their style via free-text fields. **[NEEDS INPUT]** the owner will supply the elicitation questions; until then model it as `profiles.style_text` (single rich field) or a small JSON blob — final shape follows the questions.
- At dispatch, the edge function reads the caller's profile and passes the style description **inline in the prompt** to the cloud agent. The agent uses it to fill the brief's **Voice** section.
- This erases both prior headaches at once: no `~/.me/voices/` on any machine, and nothing personal committed to a repo.
- **Consequence:** the old file-based voice resolution (`.me/voices/<name>.md` → `~/.me/voices/<name>.md`) in `packages/studio/server/agent.ts` `buildComposePrompt` is **not used** in the cloud path. The prompt builder must be re-expressed to take voice *text*, not a voice *name*.

**Privacy note:** style text is user content under tenancy + RLS. Do not log it wholesale (see §9 event log). Treat it as sensitive profile data.

---

## 5. Data model (proposed; tenant-scoped, RLS on every table)

Adapt the existing `workflow_runs` toward this. Names are proposals; reconcile with the real Cursor field names once §1.1 lands.

```text
profiles
  user_id           uuid  (pk, = auth.uid())
  style_text        text            -- [NEEDS INPUT] final shape from style questions
  created_at        timestamptz
  updated_at        timestamptz

agent_runs                          -- one row per compose request (rename of workflow_runs)
  id                uuid  (pk)
  user_id           uuid  (fk → auth.users)
  status            text            -- state machine, see below
  idempotency_key   text  (unique)  -- app-generated; guards double-dispatch
  input             jsonb           -- { research, goal }  (voice resolved server-side, see §9 re: storing)
  cursor_agent_id   text            -- [Unverified] name per API research
  cursor_run_id     text            -- [Unverified]
  branch            text            -- plumbing; where the piece was written
  result            jsonb           -- { post, tighten, to_research, unresolved } fetched back
  error             text
  created_at        timestamptz
  dispatched_at     timestamptz
  completed_at      timestamptz

agent_run_events                    -- append-only; do NOT rely on edge logs (§9)
  id                uuid  (pk)
  run_id            uuid  (fk → agent_runs)
  source            text            -- 'edge' | 'webhook' | 'reconciler'
  external_event_id text            -- for dedup
  event_type        text
  payload_hash      text
  received_at       timestamptz
  processed_at      timestamptz
  processing_error  text
```

**Status state machine** (superset of the current enum; `dispatch_unknown` is mandatory):

```text
requested → dispatching → running → awaiting_fetch → completed
                       ↘ dispatch_unknown        ↘ failed
                                                  ↘ cancelled
```

- `dispatch_unknown` = "Cursor may have received the request, but we never got confirmation." A reconciler resolves it. Distributed systems require an explicit ambiguity state.
- `awaiting_fetch` = agent reported done; we still need to pull `post.md` content back before showing it.
- Enable Realtime on `agent_runs` (as already done for `workflow_runs`).

---

## 6. Dispatch + completion flow (contracts)

### 6.1 Submit (Edge Function `POST /agent-jobs`, evolved from `start-workflow`)

1. Verify Supabase user JWT. Reject anonymous.
2. Validate + **authorize server-side**: the browser sends only stable, safe inputs — `{ research, goal, requestId }`. The server resolves repo, base branch, model, allowed tools, PR permission, concurrency limits. **Never** accept repo URL, base branch, MCP config, env vars, or auto-merge from the browser.
3. Read caller's **profile style** (§4). Build the inline-voice prompt.
4. Insert `agent_runs` row with a unique **idempotency key** (status `requested`). If the key already exists, return the existing run (idempotent).
5. Create the Cursor run (§1.1 API). Persist `cursor_run_id`/`cursor_agent_id`. On network ambiguity, set `dispatch_unknown` — do **not** blindly retry the create (double agent = double bill + duplicate branch).
6. Return `202` with the local run id. Return fast; never hold the request open for the agent.

### 6.2 Complete (webhook primary + reconciler fallback)

- **Webhook** — receiver must do signature verification, replay protection, event dedup (`external_event_id`), ordering tolerance, raw-event retention, fast ack. **[Unverified]** Cursor's signing algorithm, retry schedule, retention, and ordering guarantees — get these from §1.1; do not improvise.
- **Reconciler** — a scheduled job (Supabase cron / scheduled function) that queries non-terminal runs (`running`, `dispatching`, `dispatch_unknown`) and reconciles against Cursor. This is what makes the system durable. **Do not** run a polling loop inside `EdgeRuntime.waitUntil()` — worker lifetimes make that temporary.
- On terminal success: transition to `awaiting_fetch`, **fetch `post.md` + artifacts** (from the run's changed files or the branch via GitHub API — depends on §1.1), store in `result`, transition to `completed`. Realtime pushes to the UI.

### 6.3 Retrieval → UI

The detail page already subscribes to the run row. When `result` is populated and status is `completed`, render `result.post` with `MarkdownView`; expose artifacts as tabs. No PR is surfaced to the user (it is plumbing).

---

## 7. What this replaces

The prior session built a **local-runtime hosted worker** (`packages/studio/server/worker.ts`) that ran `@cursor/sdk` with `local: { cwd }` against the repo filesystem and `~/.me/voices/`, writing status to Supabase. **That path is set aside** (not yet deleted):

- Reusable ideas: the `202` + job-row + Realtime writeback pattern, and the Supabase service-role update code.
- Superseded: local runtime, filesystem `.input/.output`, and file-based voice resolution — all replaced by cloud runtime + repo clone + inline voice.
- Decision: keep `worker.ts` in git for reference until the cloud path is proven, then remove. Do not build on it.

The synthesize **contract** (`SKILL.md`, `BRIEF.template.md`) is unchanged and still authoritative — the cloud agent follows the same contract from the cloned repo.

---

## 8. Repo the cloud agent clones

- The agent needs the synthesize contract + plugin content. `i-write-too-much` (this repo) has it under `packages/markdown-soul/`. Candidate: point Cloud Agents at a repo that contains at least the composed `dist/plugin/` or the `packages/markdown-soul` content and `SKILL.md`.
- Research is delivered to the agent **via the prompt** (and/or written to `.input/<bundle>/research.md` in the agent's workspace by the agent itself). Voice is **inline in the prompt** (§4).
- **[Unverified]** whether the agent should clone this repo, a dedicated content repo, or a per-user scratch repo. Decide once §1.1 clarifies how runs bind to repos and how outputs come back.
- Output branch is plumbing; if content-as-versioning is ever wanted it's a later, separate decision (owner chose "read", not "PR", for the deliverable).

---

## 9. Requirements, right-sized

This is a **single-owner tool today** that will gain **auth + user tenancy**. Harden the things that bite even at n=1; defer true multi-tenant SaaS controls until there are real tenants.

**Do now (bite at n=1):**
- **Idempotency** — app-generated key on submit; `dispatch_unknown` state; no naive create-retry.
- **Secret hygiene / blast radius** — the coding agent is remote code execution. **Never** give the Cursor environment the Supabase service-role key, production DB creds, or long-lived GitHub PATs. Prefer repo-scoped, short-lived credentials. Keep deployment authority out of the agent environment. Treat repo files, prompts, and research as untrusted input.
- **Server-side authorization** — browser sends safe inputs only; server resolves repo/branch/model/tools/PR-permission.
- **Provider adapter** — put Cursor behind an interface so its response shapes don't leak across the app; store raw vendor responses separately from the canonical model.
  ```ts
  interface CodingAgentProvider {
    createJob(input: CreateJobInput): Promise<ExternalJob>;
    getJob(id: string): Promise<ExternalJobStatus>;
    cancelJob(id: string): Promise<void>;
  }
  ```
- **Append-only event log** (`agent_run_events`) — do not rely on edge logs (Supabase caps ~10k chars/message, ~100 events/10s). Store enough to diagnose; do **not** dump full prompts/style-text/source/model output indiscriminately; set a retention policy.
- **"Agent done" ≠ "business done"** — keep agent status distinct from any later CI/preview/review states. Don't collapse to one green boolean.
- **Basic cancellation + a kill switch.**

**Defer until real tenants (do not over-build now):**
- Org-wide concurrency caps, per-user daily quotas, cross-tenant abuse alerts, billing attribution dashboards, branch-collision/concurrency policy for multiple simultaneous write agents. Note them; don't build them yet.

**[Unverified] launch-blocking values to confirm from §1.1:** Cloud Agents billing unit, org quotas, API rate limits, webhook signing + retry + retention, idempotency-key support on create, outbound-network/egress controls for the agent environment (answer the egress question *before* placing any secret in the environment).

---

## 10. Build sequence (phased; land small)

Each phase ends buildable. No phase depends on unverified API details until §1.1 lands.

- **Phase A — Profiles + tenancy (no Cursor needed).**
  Add `profiles` table + RLS; profile edit UI. Placeholder `style_text` until the elicitation questions arrive. Composer reads style from the signed-in profile instead of a voice field. Ship.

- **Phase B — Provider adapter + schema (no live Cursor calls).**
  Introduce `CodingAgentProvider` interface with a **stub** implementation. Migrate `workflow_runs → agent_runs` per §5, add `agent_run_events`, the state machine, idempotency key. Contract tests against the stub. Ship.

- **Phase C — Real dispatch (requires §1.1).**
  Implement the provider against the real Cursor Cloud Agents REST API. Edge fn `POST /agent-jobs` does auth → authorize → profile → idempotent insert → create run → `202`. Persist external IDs; handle `dispatch_unknown`.

- **Phase D — Completion (requires §1.1).**
  Webhook receiver (verify/dedup/ack) + scheduled reconciler. On success, fetch `post.md` + artifacts back into `result`, flip to `completed`. Realtime → detail page renders prose.

- **Phase E — Harden.**
  Cancellation + kill switch, event-log retention, secret-scoping review, the deferred multi-tenant controls if/when tenants are real.

---

## 11. Explicit unknowns (do not fabricate)

- **[NEEDS INPUT]** Cursor Cloud Agents REST API: create-run endpoint + payload, run/agent identifiers, status enumeration, error shapes, cancellation, pagination, rate-limit responses, how changed files / output content are retrieved, how runs bind to a repo/branch. *(Owner is bringing this.)*
- **[NEEDS INPUT]** Style-elicitation questions → final `profiles` style shape. *(Owner is bringing this.)*
- **[Unverified]** Webhook signing algorithm, retry schedule, event retention, ordering guarantees.
- **[Unverified]** Idempotency-key support on Cursor's create endpoint (implement app-side idempotency regardless).
- **[Unverified]** Agent-environment egress controls (gate secret placement on this).
- **[Unverified]** Billing unit, org quotas, API rate limits.
- **[Open]** Which repo the agent clones (§8).

---

## 12. Repos & paths (orientation for a fresh session)

- **`i-write-too-much/`** (this repo): the plugin monorepo. Authoritative synthesize contract at `packages/markdown-soul/skills/synthesize/SKILL.md`; brief shape at `packages/markdown-soul/references/BRIEF.template.md`. Prior local-runtime app at `packages/studio/` (superseded for cloud path, §7). Conventions in `AGENTS.md`.
- **`cozy-core-foundation/`** (the Lovable-connected repo, GitHub: `ford-at-home/cozy-core-foundation`): the deployed frontend + Supabase. Edge fn at `supabase/functions/start-workflow/index.ts`; composer at `src/routes/_authenticated/new.tsx`; detail at `src/routes/_authenticated/runs.$runId.tsx`. Builds inside Lovable's sandbox (private registry — do not expect a clean local `bun install`).

**Locked decisions recap:** deliverable = prose in UI (PR is plumbing); voice = per-user profile injected inline (no files, no repo voices); edge fn = thin idempotent 202 adapter; durable job controller in Postgres is the real system; cloud runtime, never local, never SDK-in-edge.
