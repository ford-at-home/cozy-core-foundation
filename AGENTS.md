<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Agent instructions — Hardcopy Tools

This file is the permanent instruction layer for coding agents working on this
repository (company **Hardcopy Tools**, product **Hardcopy Draft** — both from
`src/config/brand.ts`; "Compose" survives only as an internal codename in
older identifiers). Procedures live in skills (`.cursor/skills/`); this file
holds the rules that always apply and the router that selects skills.

## Rules (always apply)

1. **Inspect before modifying.** Read `docs/ARCHITECTURE.md` and the affected
   files before changing anything. Reuse the existing implementation; never
   create a parallel second one.
2. **Do not expand scope.** No new features, dependencies, or refactors beyond
   what the task explicitly asks for.
3. **Preserve the visual identity and brand voice.** Editorial dark theme,
   tokens in `src/styles.css`, shadcn/ui components. Do not introduce new
   colors, fonts, or a `tailwind.config.*` file (this is Tailwind v4
   CSS-first). Product/company names come from `src/config/brand.ts` — never
   hardcode them in UI copy; copy conventions live in `docs/brand/`.
4. **Mobile is the primary interface.** Every UI change must work at 375px
   width first. Interactive elements keep `min-h-11` touch targets and
   safe-area padding conventions.
5. **Printable artifacts are fixed-layout US Letter documents**, not
   responsive pages. Never assume A4. The S{n}P{m} anchor rule is defined in
   `src/styles/print.css`, `contract/references/MARKUP.md`, and
   `tests/anchor-reference.ts` — change all three together or none.
6. **Secrets stay server-side.** Only `VITE_`-prefixed publishable values may
   reach client code. `SUPABASE_SERVICE_ROLE_KEY` and provider API keys are
   used only in `*.server.ts` files, API routes, and Edge Functions.
7. **Never trust the client** for authorization, ownership, prices, costs, or
   run status. Mutations to `pieces`/`agent_runs` go through Edge Functions;
   client UPDATE on those tables is revoked by design.
8. **Database changes are migrations** in `supabase/migrations/` (timestamped
   SQL). New tables get RLS enabled with policies in the same migration. Never
   weaken or drop an RLS policy to make a query work.
9. **Idempotency is mandatory** for run dispatch, webhook processing, cost
   recording, and credit operations. Respect the state machine in
   `supabase/functions/_shared/state.ts`; never write run statuses that bypass
   its transition guard. For credits and Stripe, the money rules in
   `docs/BILLING.md` are non-negotiable: append-only ledger, webhook-only
   grants, SECURITY DEFINER balance functions, no client-supplied prices.
10. **Never edit generated files**: `src/routeTree.gen.ts`,
    `src/integrations/supabase/types.ts`, `src/integrations/lovable/`.
11. **Never claim external work was done.** Lovable Cloud, the Supabase
    dashboard, and provider platforms are not reachable from this repo. List
    required manual steps explicitly instead (format: `docs/RUNBOOK.md`).
    Work that the Lovable agent must perform (applying migrations, deploys,
    secrets, test accounts, live verification) goes through the coordination
    protocol in `docs/coordination/README.md` via the
    `multi-agent-coordination` skill — not through ad-hoc handoff documents.
12. **Run validation before declaring work complete**: `npm run lint`,
    `npm run typecheck`, `npm test`, `npm run build`, plus the task-specific
    checks the selected skill requires.

## Skill router

Skills live in `.cursor/skills/<name>/SKILL.md`. Select using this table:

| When the task involves…                                                                                                                             | Use                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| unfamiliar architecture, finding where something lives, starting any non-trivial task                                                               | `repository-orientation`   |
| coordinating with the Lovable agent, backend handoffs, work items, applying/deploying/verifying in the connected environment, inbox/outbox requests | `multi-agent-coordination` |
| mobile layout, responsive behavior, UI polish, touch/keyboard/viewport issues                                                                       | `mobile-ui-polish`         |
| the print view, PDF download, page layout, S{n}P{m} anchors, pagination                                                                             | `print-artifact-fidelity`  |
| reading scanned marked-up pages, recognition prompts, resolving pen annotations to blocks                                                           | `annotation-interpretation` |
| schema, migrations, RLS, Edge Functions, Supabase config, backend secrets                                                                           | `supabase-change`          |
| run dispatch, webhooks, the reconciler, run states, idempotency, cost accounting                                                                    | `run-orchestration-change` |
| credits, the ledger, reservations, Stripe checkout or webhooks, purchases, the paywall                                                              | `billing-and-credits`      |
| release checks, failure/loading/retry behavior, resilience, pre-merge review                                                                        | `production-readiness`     |

Rules for using the router:

- **When a task touches more than one architectural boundary, use every
  relevant skill — not just the most obvious one.** The boundaries are: UI
  (mobile), print/PDF, Supabase schema, run orchestration, billing, brand,
  release readiness. Common combinations:

  | Task                                | Required skills                                                                                           |
  | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | modify artifact generation          | `print-artifact-fidelity` + `run-orchestration-change` + `billing-and-credits`                            |
  | change checkout or paywall UI       | `billing-and-credits` + `mobile-ui-polish`                                                                |
  | add a new billable artifact type    | `repository-orientation` + `billing-and-credits` + `run-orchestration-change` + `print-artifact-fidelity` |
  | change Supabase billing schema      | `supabase-change` + `billing-and-credits`                                                                 |
  | prepare a release                   | `production-readiness` + every domain skill the release touches                                           |
  | landing-page pricing or credit copy | `docs/brand/` guidance + `billing-and-credits` (claims must match implemented billing)                    |

- Beyond that, use the **smallest sufficient set** — don't read skills whose
  boundary the task genuinely does not cross.
- **Read each selected skill file completely before changing code.**
- Task-specific instructions override skill defaults when explicitly stated.
- If no skill fits and the work is specialized or recurring, say so in your
  final report (see `docs/AGENT-PROMPTS.md` → Maintenance) rather than
  improvising silently.

## Mandatory workflow

Before editing:

1. Read this file.
2. Read `docs/ARCHITECTURE.md`.
3. Check the coordination channel: `docs/coordination/cursor/inbox/` for
   incoming requests and `docs/coordination/shared/work-items.md` for
   active work items (protocol: `docs/coordination/README.md`, skill:
   `multi-agent-coordination`).
4. Identify applicable skills from the router above.
5. Read those skill files completely.
6. State which skills you are applying and why.
7. Follow their procedures and validation requirements.

## Final report contract

Every implementation agent's final response must include:

```
Skills used:
- <skill> — <one line: why>
Validation completed:
- <command or check> — <result>
Manual actions still required:
- <action or "None">
Known limitations:
- <limitation or "None">
```

Validation lines must name real commands or concrete checks that were actually
run — "reviewed the result" does not count.

## Reviewer subagents

Read-only specialist reviewers are defined in `.cursor/agents/`. Use them for
independent review of high-risk changes (the implementing agent should not be
the only one declaring its own billing-adjacent or layout-critical work sound):

| Subagent                     | Reviews                                                                |
| ---------------------------- | ---------------------------------------------------------------------- |
| `mobile-ux-reviewer`         | touch targets, overflow, safe areas, keyboard/zoom behavior            |
| `print-layout-reviewer`      | page geometry, anchor sync, pagination, PDF config                     |
| `backend-integrity-reviewer` | RLS, idempotency, secret boundaries, state-machine and cost invariants |
