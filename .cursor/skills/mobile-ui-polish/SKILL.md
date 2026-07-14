---
name: mobile-ui-polish
description: Refine the existing Hardcopy Draft UI mobile-first without redesigning it — responsive layout, touch targets, safe areas, keyboard behavior, overflow, breakpoints, including the billing/paywall surfaces. Use for tasks mentioning mobile layout, phone screens, responsive fixes, UI polish, touch/tap issues, viewport or keyboard problems. Preserves the editorial dark visual identity; never expands features.
---

# mobile-ui-polish

## Purpose

Polish and fix UI in this repository the way it is already built: mobile as the
primary interface, Tailwind v4 responsive utilities, the established
safe-area/touch-target/breakpoint conventions, and the existing editorial dark
theme. The output is refinement of what exists — never a redesign, never a new
feature.

## Use this skill when

- The task mentions mobile, phone, responsive, small screens, touch targets,
  overflow, viewport, keyboard behavior, or "polish"/"refine" of existing UI.
- A layout breaks at narrow widths or content hides behind the bottom tab bar.
- Adding a new page/section that must match the existing responsive patterns.

## Do not use this skill when

- The change is to the print view or PDF output → `print-artifact-fidelity`
  (the print document is fixed-layout, not responsive).
- The task requires new product functionality — stop and confirm scope first.
- The problem is data/loading behavior, not layout → `production-readiness`
  (failure-state review) or the relevant backend skill.

## Required context

- `src/styles.css` — all design tokens (`@theme inline`), the 16px mobile
  input rule, `.markdown-output` prose styles. There is **no tailwind.config**.
- `src/routes/_authenticated/route.tsx` — the authenticated shell: desktop
  header (`hidden sm:flex`), mobile bottom tab bar (`sm:hidden`), safe-area
  padding.
- The specific route file(s) under `src/routes/` being changed, plus one
  sibling that already does it right as reference:
  - card-list on mobile / table on `md+`: `src/routes/_authenticated/sessions.tsx`
  - responsive header + action buttons: `src/routes/_authenticated/print.$runId.tsx`
- `src/hooks/use-mobile.tsx` exists (768px) but the codebase convention is
  Tailwind responsive classes, not the hook. Follow the convention.
- **Billing surfaces** (added with the credit system — polish them by the same
  rules): the header balance chip `src/components/CreditBalance.tsx` (amber at
  ≤1 credit, links to `/billing`), the billing page
  `src/routes/_authenticated/billing.tsx` (packs, purchase history, ledger,
  and the `?status=success|canceled` checkout-return banners), and the
  inline out-of-credits banners in `new.tsx` / `runs.$runId.tsx` driven by
  `src/lib/use-credits.ts`. **Billing is a primary nav tab** (mobile short
  label "Credits", `CreditCard` icon) in `route.tsx`; the header balance chip
  stays as the at-a-glance balance indicator alongside it — do not remove or
  shrink it below `min-h-11`. USD cost accounting (`/sessions`) is **not** in
  the tab bar; it is reached from a link on the billing page.

## Repository conventions (verified — follow these exactly)

| Concern                  | Convention                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Breakpoints              | Base styles are mobile; add `sm:` (640px) / `md:` / `lg:` variants for larger screens. Never write desktop-first and subtract.                                                                   |
| Touch targets            | `min-h-11` (44px) on all tappable elements; on desktop optionally reset with `sm:min-h-0`.                                                                                                       |
| Bottom tab bar clearance | Page content inside the authenticated layout already gets `pb-[calc(5.5rem+env(safe-area-inset-bottom))]`; don't duplicate it, don't defeat it with `fixed` footers.                             |
| Safe areas               | `env(safe-area-inset-top/bottom)` via inline style or arbitrary values, as in `route.tsx` and `index.tsx`.                                                                                       |
| iOS zoom                 | Inputs get ≥16px font at <768px — already global in `src/styles.css`; don't override input font-size below 16px on mobile.                                                                       |
| Height                   | `min-h-dvh`, never `100vh`.                                                                                                                                                                      |
| Wide content             | Tables and wide data get a mobile card alternative (`md:hidden` cards + `hidden md:block` table), not horizontal page scroll.                                                                    |
| UI copy / names          | Product and company names come from `src/config/brand.ts` (`brand`, `pageTitle()`), never hardcoded. Copy changes follow `docs/brand/BRAND.md` voice + `docs/brand/UI-COPY-MAP.md` dispositions. |
| Full-width buttons       | Mobile buttons `w-full`, then `sm:w-auto`.                                                                                                                                                       |
| Colors/type              | Only semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`, serif = `font-serif`). No hex values, no new fonts.                                               |

## Procedure

1. Read the affected route(s) and the reference sibling. Identify which of the
   conventions above the current code uses.
2. Reproduce/verify the issue at mobile width first. If a dev server is
   possible in your environment, run `npm run dev` and inspect at 375×667
   (iPhone SE class), 390×844, then 768px and 1280px. If not, verify by
   reading the class structure and state the limitation in your report.
3. Make the smallest change that fixes mobile without regressing `sm:`/`md:`
   layouts. Base classes = phone; larger screens get variants.
4. Check every interactive element you touched for `min-h-11` and visible
   focus (`focus-visible:ring-…` per existing buttons).
5. Check for horizontal overflow: any fixed widths, unwrapped long strings
   (`min-w-0` + `truncate`/`break-words` on flex children), tables without a
   mobile alternative.
6. Check keyboard interactions for inputs you touched: 16px font on mobile,
   nothing critical hidden behind the tab bar when the on-screen keyboard is
   open (avoid `fixed` bottom elements inside forms).
7. If the change touches billing/paywall UI: keep the checkout-return states
   honest — `status=success` is a display banner only (credits arrive via the
   Stripe webhook; the UI polls, it never grants), `status=canceled` must
   preserve prior state, and a pending purchase must never render as
   completed. Behavior changes here need `billing-and-credits` as well.
8. Stop when the reported issue is fixed. Do not restyle neighboring
   components, "modernize" spacing, or introduce new UI elements.

## Validation

Required, in order:

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Viewport verification at 375px, 768px, 1280px — via running app if the
      environment allows, otherwise by explicit reasoning over the class
      structure, reported as such.
- [ ] No horizontal scroll at 375px on the changed pages.
- [ ] All touched interactive elements ≥44px tall on mobile.
- [ ] Screenshots captured when a browser is available (attach to the report).

For independent review of significant layout changes, hand the diff to the
`mobile-ux-reviewer` subagent (`.cursor/agents/mobile-ux-reviewer.md`).

## Failure modes

- **Desktop-first CSS**: writing the desktop layout in base classes and hiding
  things on mobile. Mobile is the primary interface; hiding functionality on
  phones is a scope change, not polish.
- Fixing a table by letting the whole page scroll horizontally instead of
  adding the mobile card pattern.
- Adding `h-screen`/`100vh` (breaks under mobile browser chrome) instead of
  `min-h-dvh`.
- Overriding the global 16px mobile input rule and reintroducing iOS zoom.
- Introducing raw colors or a new component library instead of tokens +
  existing shadcn primitives.
- Editing `src/components/ui/*` (vendored shadcn) to fix one page's issue —
  fix at the usage site.
- Touching the print route's iframe content while polishing the page around
  it (that content is governed by `print-artifact-fidelity`).

## Output contract

- Files changed, with the convention applied for each fix.
- Viewports verified and how (running app vs. static analysis).
- Validation commands run and results.
- Screenshots if captured.
- Anything deliberately left unchanged (e.g. adjacent issues out of scope).

## References

- `docs/ARCHITECTURE.md` → Mobile section
- `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/sessions.tsx` (canonical patterns)
- `.cursor/skills/billing-and-credits/SKILL.md` — required alongside this
  skill for any checkout/paywall/balance behavior change
