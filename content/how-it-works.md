---
title: How Lovable Cloud and Cursor Agents Work Together
description: An engineering walkthrough of the development workflow and product runtime behind Hardcopy Tools — ownership, information flow, tradeoffs, and why Cursor cost attribution still stops at aggregates (no native per-session or per-agent dollars).
kicker: Engineering notes
---

Two systems share a git repository. They do not share dashboards, deploy buttons, or a single notion of “done.” That sounds like a coordination headache — and for a while, it was. Treating Lovable Cloud and Cursor Agents as complementary planes, with the repository as the only reliable bus between them, turned the headache into a workflow we can actually run.

This page is both a public engineering note and a how-it-works document for how we build (and operate) Hardcopy Tools. It is opinionated on purpose: the interesting part is not the vendor logos, but the boundaries we had to draw by hand.

## Why this combination is unusual

Most “AI coding” setups collapse into one of two patterns: an IDE agent that edits a repo and hopes someone deploys it, or a hosted app builder that owns the whole stack and treats agents as a black box. We run both at once, on purpose.

**Lovable Cloud** gives us a connected environment: the shipped app on `hardcopy.tools`, Supabase, secrets, auth wiring, and the ability to apply migrations and deploy Edge Functions. It is the durable control surface for the product.

**Cursor Agents** (interactive IDE agents and unattended Cloud Agents) give us isolated coding work: clone the repo, follow instructions, open branches and PRs, run tests, leave evidence. They are a disposable execution surface.

Neither side sees the other’s console. The only medium both reliably share is **git**. So we stopped pretending Slack threads or ad-hoc brief documents were an API, and put a real asynchronous protocol in the repository under `docs/coordination/`.

That is the novel bit: not “we use AI,” but **two agents with hard ownership boundaries, coordinated through files that both can read, with evidence required before anyone claims the live environment changed.**

<!-- diagram:coordination -->

## Who owns what

Blurred ownership is how we grew two parallel migration streams and documentation that contradicted the live database. The fix was boring and non-negotiable.

| Plane | Owns |
| --- | --- |
| **Cursor (repo-side)** | Frontend, routes, UX, tests, CI, docs, *authoring* Edge Function source and migrations, analysis from repository evidence. Changing a file is not deployment. |
| **Lovable (connected env)** | Applying migrations, deploying Edge Functions, secrets and env vars, auth/storage configuration, test accounts, live queries, logs, smoke tests. |
| **Humans** | Spending money, secret *values*, destructive operations, external dashboards (Stripe, Cursor, research providers), conflict resolution. |

Cross-boundary work always gets an explicit work item (`WI-nnnn`). Cursor may write a migration; Lovable applies it and returns evidence. Nobody silently marks the other agent’s work complete.

## How information flows

Requests go into the **other** agent’s inbox. Results come back through the performing agent’s outbox. Shared summaries (`current-state`, `decisions`, `blockers`, the work-item registry) are append-only and attributed.

A typical backend change looks like this:

1. Cursor implements SQL or Edge Function source in the repo, pushes to `main` (or a reviewable branch).
2. Cursor files a request in Lovable’s inbox with exact actions, constraints, and completion criteria.
3. Lovable applies or deploys in the connected project and writes results — with evidence — to its outbox.
4. Cursor reads the evidence before treating the change as live.

Frontend code on `main` syncs to Lovable and ships with the app. **Migrations do not auto-apply. Edge Functions do not auto-deploy on push.** We learned that the expensive way, then confirmed it with deliberate pipeline experiments. Repo green is necessary; it is not sufficient.

The protocol exists because informal handoffs failed. Two migration histories, a docs/DB split, and no reliable answer to “did you actually deploy that?” were enough. Mechanical inbox/outbox is slower for tiny tasks and much faster for truth.

## Inside the product: control plane and execution plane

The same complementary shape shows up in the *product* runtime — not only in how we develop it.

Hardcopy Draft (on Lovable Cloud + Supabase) is the **control plane**: authentication, job rows, credit reservation, idempotency, webhooks, the reconciler, fetch-back of artifacts, Realtime updates to the UI.

Cursor Cloud Agents are an **execution plane** for some heavy jobs: clone the content contract, write markdown or final artifacts on a branch, leave a PR. Parallel AI and the Lovable AI Gateway handle other jobs (deep research, handwriting recognition, transcription). The point is the same: durable state lives in our database; vendors execute and return.

<!-- diagram:runtime -->

A few decisions define this runtime:

- **The database is source of truth.** Webhooks are optimizations. A reconciler is authoritative when events are missed, reordered, or status-only.
- **Idempotency is application-owned.** Cursor’s create API does not give us vendor-side idempotency keys for free. We insert the job row first, reserve credits, and refuse to invent “done” from a retry.
- **The agent VM gets no app secrets.** Prompt in, branch out. Credentials stay in Edge Functions and provider dashboards.
- **Never trust the client** for ownership, prices, costs, or run status. Mutations that matter go through Edge Functions; client updates on controller tables are revoked by design.

This is not the flashiest architecture diagram. It is the one that survives a missed webhook at 2 a.m.

## Decisions and tradeoffs

**Repo-as-bus vs. a separate ticket system.** We chose files in git. They version with the code, review in PRs, and require no third dashboard both agents can access. The cost is ceremony and the discipline not to “clean up” the other agent’s entries.

**Advisory model policy in the repo; enforcement in Cursor’s product.** Skills and `AGENTS.md` can recommend Composer for routine work and premium models for review. They cannot switch the model. Spend limits, blocklists, and Cloud Agent defaults live in the Cursor dashboard. Pretending otherwise produces confident, wrong claims in PR descriptions.

**Cheap implement, premium review.** Output tokens dominate cost. Letting a cheaper model write and a stronger model review a small diff usually beats premium-everything — for both quality control and spend.

**Force-push and history rewrite are forbidden** on the Lovable-connected branch. Lovable syncs history; rewriting it loses project history on their side. Keep `main` shippable.

**Single shared Supabase environment** (preview and production sharing one project, in our current setup) simplifies ops and raises the blast radius. We document it instead of wishing it away.

## Patterns that emerged

1. **Skills as organizational memory.** A router in `AGENTS.md` points agents at domain procedures (mobile UI, print fidelity, billing, orchestration) so they do not invent a second implementation.
2. **A final report contract.** Every substantial Cursor task must list skills used, validation actually run, manual actions still required, and known limitations. “I deployed it” without evidence is a protocol violation, not a vibes issue.
3. **Evidence or it did not happen.** Outbox results beat chat claims.
4. **Asymmetric adoption is real.** A protocol only works when both sides use it. Until the connected-environment agent formally adopts the same rules, handoffs can be one-directional. Plan for that; do not assume telepathy.
5. **Measure what the vendor exposes.** For Cursor spend, that currently means aggregates and (on Enterprise) per-event `totalCents` without a session key — which brings us to cost.

## Cost management in Cursor

Building this way means real money on Cursor’s token-billed credit pool, especially for Cloud Agents. As of mid-2026, Cursor exposes solid **aggregate** controls and dashboards — and almost nothing that attributes dollars to a single agent session out of the box. The rest of this section is what we verified against Cursor’s own docs and APIs; billing surfaces move, so treat dated details as a snapshot.

### Spend limits

- **Team and member spend limits** cap on-demand usage. Admins can set hard caps; the Enterprise Admin API also exposes `POST /teams/user-spend-limit` for member-level writes. Smart spend alerts (rebuilt in 2026) can fire before a billing surprise and route to Slack or email.
- **Cloud Agent spend limit** is prompted on first use. Set it before unattended runs become a habit — Cloud Agents always run Max Mode and bill at API pricing for the selected model, with no Auto option.
- Soft alerts and process still matter: limits stop the bleeding; they do not explain *which* agent caused it.

### Usage limits and billing pools

Cursor bills on tokens, denominated in dollars. In practice you see **two pools** in the product: a cheap included path for Auto and first-party models such as Composer 2.5, and an API-priced path for named third-party frontier models. Auto has fixed flat rates regardless of which underlying model it selects; on Teams/Enterprise, non-Auto third-party requests also carry Cursor’s per-million Token Rate.

Repository files cannot enforce any of this. Defaults, blocklists, CLI/SDK `model` fields, and dashboard spend controls can.

### Aggregate usage dashboards

The usage dashboard (`cursor.com/dashboard/usage`) is the day-to-day visibility surface: both pools, per-model breakdowns, and a Daily Usage chart. Users see their own spend. The UI does **not** decompose that spend into sessions or agents.

Team analytics add volume signals — messages by mode and model, active users, lines suggested, “Agents Created” (each Cloud Agent startup) — and Enterprise adds Conversation Insights and CSV exports from analytics charts. Useful for trends. Still aggregate.

On Enterprise, the Admin API goes further: `/teams/spend` for per-member cycle spend, and `/teams/filtered-usage-events` for **per-event** token counts plus `totalCents`. That event feed is the closest official dollar detail Cursor publishes — and it is keyed to **user + timestamp + model**, not to a session or agent ID. Retention on granular events is short (on the order of days to a few weeks), so anything you care about must be archived continuously.

### Cloud Agents dashboard

The Cloud Agents UI and settings cover default model, Max Mode (forced on), long-running toggles, spend limit, and run status — “what ran?” and “is it done?” Team analytics can count agent startups. What they do **not** show is a dollar ledger per agent.

That matches the API: `GET /v0/agents/{id}`, the `statusChange` webhook, and the conversation endpoint expose status, git/PR targets, and summary text. There is **no `usage`, `cost`, `tokenUsage`, or `spendCents` field** on the documented Cloud Agents REST surface. Anyone claiming “per-agent cost via the Cloud Agents API” is describing a feature that does not exist today.

<!-- diagram:cost -->

### The limitation that still hurts

**Per-session and per-agent dollar cost attribution is not natively exposed.** Billing events carry no session or agent ID. The Cloud Agents API and webhook carry no cost or token data. The CLI’s JSON/`stream-json` result emits duration and `session_id` but no tokens. The TypeScript SDK’s `Run.usage` returns per-run **token** counts (not dollars) — and only for runs you launched through the SDK.

So you get:

| What you can see | What you cannot see |
| --- | --- |
| Team/member spend limits and alerts | Dollar cost of one IDE chat session |
| Aggregate usage dashboards and pools | Dollar cost of one Cloud Agent |
| Per-event `totalCents` (Enterprise Admin API) keyed by user/model/time | A join key from that event to `conversation_id` / agent id |
| SDK token usage for SDK-launched runs | Tokens or dollars on Cloud Agents REST/webhook |

Finer-grained native reporting looks directionally likely — admin exports, richer analytics, more automation surfaces — but it is **not available today**. Until billing events carry a session or agent ID (or the Cloud Agents API grows a cost field), precise attribution is something you *build*, not something you *read*.

That gap matters when two Cloud Agents, three IDE chats, and a retry storm share a billing cycle. You can reconcile the invoice. You cannot cleanly answer “which agent burned Tuesday?” without a heuristic join.

### How we compensate (imperfectly)

The raw materials for a DIY ledger exist: Admin API `filtered-usage-events` as the billing source of truth, Hooks (`conversation_id`, `generation_id`, model, timestamps) and SDK `TokenUsage` as the identity layer, joined on something like `userEmail + model + timestamp window`. Accuracy can be excellent at user/model/day and only roughly right (~80–90%) at session or PR grain — because the join is inferred, not keyed. Local tokenizers fill real-time gaps and drift on hidden system prompts, cache tiers, and Auto’s flat rates.

We have not shipped that daemon. In-repo we attach optional `model_class` and `estimated_cost_usd` to work items and join dashboard aggregates to PRs and `WI-nnnn` rows in an agent-metrics practice. Inside the product, Hardcopy Draft tracks *application* inference cost separately from Cursor’s platform bill. Cursor spend and Lovable/Supabase spend remain separate silos. None of that replaces a first-class per-agent cost field in Cursor. It is a stopgap until the platform exposes one — or until we invest in the hybrid collector.

## What we would tell another team

Start with **ownership and evidence rules** before you tune prompts. Decide who may claim a migration is live, and what proof looks like.

Budget **Cloud Agents separately** from interactive Composer work. They are different products that share a credit card, and the Cloud Agents API will not itemize the bill for you.

Set **spend limits early**, and if you are on Enterprise, **archive `filtered-usage-events` continuously** before retention erases them. Accept that attribution below user/model/day is heuristic until Cursor ships a session/agent join key in billing data. Do not wait for perfect session-level reporting before capping spend.

Keep the control plane boring and the execution plane replaceable. The integration gets interesting when you respect that split — in development *and* in production.

## Closing

Lovable Cloud and Cursor Agents are effective together when you stop asking either one to be the whole company. One side hosts and verifies. The other side codes and proposes. The repository carries the messages. Humans still own the money and the irreversible clicks.

That is not magic. It is an engineering workflow with sharp edges, explicit handoffs, and dashboards that tell the truth at the resolution they have — not the resolution we wish they had.
