---
title: How Lovable Cloud and Cursor Agents Work Together
description: An engineering walkthrough of the development workflow and product runtime behind Hardcopy Tools — ownership, information flow, tradeoffs, and what Cursor’s cost dashboards can (and cannot) tell you today.
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
5. **Measure what the vendor exposes.** For Cursor spend, that currently means aggregates — which brings us to cost.

## Cost management in Cursor

Building this way means real money on the Cursor API pool, especially for Cloud Agents. Here is what we can control and see today, and what we still cannot.

### Spend limits

- **Team spend limits** cap monthly on-demand usage; soft-limit alerts at 50%, 80%, and 100% help you intervene before the hard stop.
- **Cloud Agent spend limit** is prompted on first use. Set it before unattended runs become a habit.
- **Per-user hard spend caps** are an Enterprise feature. On Teams, you lean on soft alerts, seat discipline, and process — not a per-person kill switch.

### Usage limits and billing pools

Cursor effectively has **two pools**: a cheap included pool for Auto and Composer-class work, and an **API pool** for explicitly selected frontier models at provider list prices. Cloud Agents are structurally premium: curated models, **Max Mode always on**, no Auto. Treat them as a scarce surface, not a default.

Repository files cannot enforce any of this. Defaults, blocklists, CLI/SDK `model` fields, and dashboard spend controls can.

### Aggregate usage dashboards

The usage dashboard (`cursor.com/dashboard/usage`) shows spend and usage across pools. You can filter by user and by product surface (IDE clients, Cloud Agents, automations, and related tools). Teams/Enterprise add admin views and APIs for pulling spending data. This is genuine visibility — at an **aggregate** and per-request row level you can browse — but it is not a finished FinOps product for multi-agent shops.

### Cloud Agents dashboard

Cloud Agents settings cover default model, Max Mode (forced on), long-running toggles, and the spend-limit surface. The agents UI is where you inspect unattended runs. It answers “what ran?” better than “what exactly did that one session cost relative to the others?”

<!-- diagram:cost -->

### The limitation that still hurts

There is **no detailed per-session or per-agent cost breakdown** available today that makes it easy to attribute spend to an individual development session or a single agent identity the way a well-instrumented internal job system would.

What you get is **aggregate usage and spend**, plus request-level rows you can filter in the dashboard. Finer-grained reporting appears to be on the roadmap from the vendor’s direction of travel (admin exports, richer filtering, more automation surfaces), but it is **not** something we can rely on in day-to-day attribution right now.

That gap matters when two Cloud Agents, three IDE chats, and a retry storm share a billing cycle. You can see the total. You cannot cleanly answer “which agent burned Tuesday?” without manual correlation.

### How we compensate (imperfectly)

In-repo we attach optional `model_class` and `estimated_cost_usd` fields to work items, and we join dashboard aggregates to PRs and `WI-nnnn` rows in an agent-metrics practice. Inside the product, Hardcopy Draft tracks *application* inference cost separately from Cursor’s platform bill. None of that replaces a first-class per-agent cost ledger in Cursor. It is a stopgap until the platform exposes one.

## What we would tell another team

Start with **ownership and evidence rules** before you tune prompts. Decide who may claim a migration is live, and what proof looks like.

Budget **Cloud Agents separately** from interactive Composer work. They are different products that share a credit card.

Accept **aggregate cost visibility** for now. Build lightweight attribution in your own tracker if you need chargeback narratives. Do not wait for perfect session-level reporting before setting spend limits.

Keep the control plane boring and the execution plane replaceable. The integration gets interesting when you respect that split — in development *and* in production.

## Closing

Lovable Cloud and Cursor Agents are effective together when you stop asking either one to be the whole company. One side hosts and verifies. The other side codes and proposes. The repository carries the messages. Humans still own the money and the irreversible clicks.

That is not magic. It is an engineering workflow with sharp edges, explicit handoffs, and dashboards that tell the truth at the resolution they have — not the resolution we wish they had.
