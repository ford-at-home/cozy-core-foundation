
# Hardcopy Tools — Suite Redesign

Reframe the site so the homepage is a small catalog of five instruments rather than a landing page for one app. The current app becomes **Proof**, reachable from its catalog entry. Everything outside the app is rebuilt around calm typography, generous whitespace, and the hand-drawn product sketches.

## Scope

- **Only the outer experience changes.** No changes to the authenticated app, run orchestration, billing, print pipeline, or database. Auth still lives at `/auth`; the app still lives under `/_authenticated/*`.
- **Proof = the existing product.** Its product page's primary action links to `/auth` (existing sign-in / dashboard flow).
- Four new products (Edition, Dialogue, Interlude, Canon) are presentational only — no backend, no forms beyond the shared follow input.

## Information architecture

```text
/                    Suite catalog (new homepage)
/proof               Proof product page  → "Enter Proof" links to /auth
/edition             Edition product page (Beta)
/dialogue            Dialogue product page (Coming Soon)
/interlude           Interlude product page (Coming Soon)
/canon               Canon product page (Coming Soon)
/auth                Unchanged
/_authenticated/*    Unchanged
```

Each product route is its own file under `src/routes/` with its own `head()` metadata (unique title, description, og:title, og:description). No og:image on `__root.tsx`.

## Homepage (`/`)

The cover of a book, not a landing page.

- Small wordmark + one-line philosophy at top ("AI that knows when to disappear" or a quieter successor — see Copy below).
- The five products as a vertical, unhurried list (single column on mobile, two columns from `md:` up). Each entry: product name in serif display, one-line descriptor, status in small caps set in muted color, the graphite sketch to the side. Entire row is a link to the product page.
- No hero CTA, no feature grid, no testimonials, no "how it works" section.
- A single closing line at the bottom above the follow form. No footer nav duplicating the catalog.

Status treatment: plain small-caps text ("Available", "Beta", "Coming soon") in `text-muted-foreground` — no pills, no dots, no colored badges. Available items are subtly more present (full-opacity title); coming-soon items sit at ~70% opacity so the eye lands on Proof and Edition first without any decoration doing the work.

## Product pages

One template, five instances. Each page holds:

- Product name (serif, large, quiet).
- One line of status in small caps.
- A short paragraph on **why the product exists** and **which medium it embraces**.
- The graphite sketch, given real room — no card, no border, no drop shadow.
- One line on why we're building it.
- A single action:
  - Proof → "Enter Proof" linking to `/auth`.
  - Edition → "Request early access" opens the same follow input, prefilled with product context.
  - Dialogue / Interlude / Canon → no button. A single italic line: *"This is coming."*
- A small "Return to the suite" link back to `/`.

Pages should feel deliberately unfinished — one screen of content, no filler.

## Follow section

At the bottom of `/` (and reused on product pages via a shared component):

- One sentence: "Hear about new instruments as they arrive."
- Single email input + quiet submit. No checkbox, no promise text, no "we respect your privacy" boilerplate.
- Submission target: for this pass, a `mailto:` or a no-op form that shows a confirmation line. Backend wiring for a real subscription list is **out of scope** for this plan — flag as a follow-up if the user wants it stored.

## Visual system

Reuse existing tokens in `src/styles.css` (dark editorial theme, amber accent). No new colors, no new fonts, no `tailwind.config.*`. Adjustments:

- Lean harder on the existing serif for product names and page headings; body stays sans.
- Increase vertical rhythm on the homepage (larger `py` between entries than the current landing uses).
- Remove the current gradient wash behind the hero — replace with plain background.
- Sketches render at natural aspect ratio with generous margin; no frame, no caption chrome.

## Assets

Five hand-drawn graphite sketches, one per product, provided by the user. Placement in the plan:

- Save under `src/assets/suite/` as `proof.jpg`, `edition.jpg`, `dialogue.jpg`, `interlude.jpg`, `canon.jpg` (jpg for graphite photography).
- Imported via ES6 image imports in each route.
- **Blocker until provided:** the plan ships placeholder `<div>` slots at the correct aspect ratio so layout is real; sketches drop in without further layout changes. Confirm in build mode whether to wait for sketches or proceed with placeholders.

## Copy

Product descriptors come verbatim from the user's brief (Proof, Edition, Dialogue, Interlude, Canon paragraphs). `src/config/brand.ts` grows a `suite` export listing the five products with `{ name, status, oneLine, why, medium, href }` so pages and homepage read from one source.

`brand.product.name` ("Hardcopy Draft") is replaced by the suite model; the old "Hardcopy Draft" label is retired from public surfaces but kept in the app's internal chrome only where it currently appears in authenticated views (out of scope to sweep those in this pass — flagged).

## Files touched

New:
- `src/routes/proof.tsx`
- `src/routes/edition.tsx`
- `src/routes/dialogue.tsx`
- `src/routes/interlude.tsx`
- `src/routes/canon.tsx`
- `src/components/suite/ProductPage.tsx` (shared template)
- `src/components/suite/FollowInvite.tsx`
- `src/components/suite/StatusLabel.tsx`
- `src/assets/suite/` (sketches, when provided)

Rewritten:
- `src/routes/index.tsx` — becomes the suite catalog. Existing `Hero / Problem / HowItWorks / AICompact / FirstProduct / WhyPaper / Authorship / DesignedForLeaving / Ecosystem / FinalAction / SiteHeader / SiteFooter` sections are removed. Nothing on this page is preserved except the `PageMark` in the wordmark.

Updated:
- `src/config/brand.ts` — add `suite` array; refine `meta` title/description for the catalog framing.
- `src/routes/__root.tsx` — verify no og:image at root; keep `<Outlet />`; adjust default title if needed.

Untouched:
- Everything under `src/routes/_authenticated/*`
- `src/routes/auth.tsx`
- `src/routes/api/*`
- All server functions, edge functions, migrations, print pipeline
- `src/config/workflow-copy.ts` (used inside the app; no longer imported by `/`)

## Out of scope (flag, don't do)

- Wiring the follow form to a real subscription store.
- Sweeping "Hardcopy Draft" references out of the authenticated app UI.
- Any change to Proof's in-app experience, billing copy, or dashboard.
- New illustrations or generated imagery — the graphite sketches are the only art.

## Validation

- `npm run lint`, `npm run typecheck`, `npm run build`.
- Manual: visit `/`, each of the five product routes, and confirm Proof → `/auth` works and other CTAs behave as specified. Check 375px width first.

## Open question before build

1. Sketches: proceed with placeholder slots now and drop the images in later, or wait until you upload the five graphite sketches before I start?
