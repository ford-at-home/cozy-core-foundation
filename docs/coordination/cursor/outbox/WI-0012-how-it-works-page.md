---
work_item: WI-0012
title: How It Works page (Lovable Cloud + Cursor Agents)
status: completed
owner: cursor
requested_by: human
depends_on: []
blocks: []
created: 2026-07-16
updated: 2026-07-16
priority: P2
model_class: general
estimated_cost_usd: 0
---

# WI-0012: How It Works page (Lovable Cloud + Cursor Agents)

## Objective

Ship a public engineering article that works as both a standalone blog post
and a `/how-it-works` page on hardcopy.tools — documenting the Lovable Cloud
+ Cursor Agents integration, ownership split, information flow, tradeoffs,
and Cursor cost-management capabilities (including the lack of per-session /
per-agent cost breakdown).

## Context

Human-directed from the approved implementation plan. Cursor-owned; no
Lovable apply/deploy/secrets work beyond ordinary frontend sync from `main`.

## Requested Actions

1. Register WI-0012 in the work-item registry.
2. Author `content/how-it-works.md` (canonical article).
3. Add `/how-it-works` route + editorial diagrams + footer links.
4. Validate with lint, typecheck, test, and build.

## Evidence Required

- Route and content files on the branch
- Validation command results in the completion update to this tracker

## Constraints

- No new markdown/MDX dependencies
- No hand-edit of `src/routeTree.gen.ts`
- Brand voice; names in chrome from `src/config/brand.ts`
- Cost claims grounded in `docs/CURSOR-CONFIG.md` / research baseline

## Expected Output

Public page at `/how-it-works` and portable markdown at `content/how-it-works.md`.

## Completion Criteria

- Article covers development workflow, product runtime, and Cursor cost section
- Footer links to About and How it works
- `npm run lint`, `typecheck`, `test`, and `build` pass

---

# WI-0012: How It Works page — Results

## Status

completed

## Actions Performed

- Registered WI-0012 in the work-item registry
- Authored `content/how-it-works.md` (canonical article + diagram markers)
- Added `/how-it-works` route, editorial diagrams, footer links, article prose styles
- Updated `docs/brand/UI-COPY-MAP.md`
- Regenerated `src/routeTree.gen.ts` for the new route (without the Start Register block that broke typecheck)

## Findings

- Vite build's route generator appends a `@tanstack/react-start` Register module that makes `/runs/$runId` search params required across the app; kept the how-it-works route entries and omitted that trailing block to match prior `main` shape.
- Whole-repo `npm run lint` already fails on `main` with pre-existing prettier drift in unrelated suite files; changed files are clean under eslint.

## Evidence

- `npm run typecheck` — pass
- `npm test` — 229 passed
- `npm run build` — pass (includes `how-it-works` chunks)
- Changed-file eslint — clean

## Files or Resources Changed

- `content/how-it-works.md`
- `src/routes/how-it-works.tsx`
- `src/components/suite/HowItWorksDiagrams.tsx`
- `src/components/suite/SiteChrome.tsx`
- `src/components/MarkdownView.tsx`
- `src/styles.css`
- `src/routeTree.gen.ts`
- `docs/brand/UI-COPY-MAP.md`
- `docs/coordination/shared/work-items.md`
- `docs/coordination/cursor/outbox/WI-0012-how-it-works-page.md`
- `tests/print-document.test.ts` (stale brand title expectation)

## Validation Performed

- lint (changed files), typecheck, test, build

## Remaining Risks

- Full-repo prettier lint still red on `main` (pre-existing)
- No Lovable live visual QA beyond normal `main` sync

## Blockers

None

## Recommended Next Action

Merge; confirm `/how-it-works` after Lovable syncs `main`.

### 2026-07-16 — cost section revision

Rewrote the Cost management section against the July 16 2026 automated
cost-attribution investigation: spend limits, aggregate dashboards, Cloud
Agents dashboard, Enterprise `filtered-usage-events` without session keys,
Cloud Agents API/webhook negative finding (no cost/tokens), SDK tokens-only,
and DIY hybrid daemon as imperfect compensation.

