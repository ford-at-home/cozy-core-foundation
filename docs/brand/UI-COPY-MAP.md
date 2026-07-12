# UI Copy Map

Every user-facing label reviewed for the brand layer, with its disposition.
Rule: rename only where the new term accurately matches current behavior.
Technical concepts (runs, sessions, PRs, status machine) keep their names —
renaming them would misdescribe what the system does.

## Global chrome

| Location                                     | Was                      | Now                                                                          | Why                                   |
| -------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------- |
| Header wordmark (`_authenticated/route.tsx`) | "C" monogram + "Compose" | Folded-page glyph + "Hardcopy Tools"                                         | Company brand                         |
| Nav "Dashboard"                              | Dashboard                | **retained**                                                                 | Accurate                              |
| Nav "New piece"                              | New piece                | New draft                                                                    | "Draft" is the product's unit of work |
| Nav "Cost"                                   | Cost                     | **retained**                                                                 | Accurate, honest                      |
| Nav "Profile"                                | Profile                  | **retained**                                                                 | Accurate                              |
| Root `<title>`/OG (`__root.tsx`)             | "Compose" / sign-in copy | "Hardcopy Tools \| AI That Knows When to Disappear" + brand meta description | Brand metadata                        |
| 404 / error pages                            | generic                  | **retained** (already calm and clear)                                        | No brand value in touching them       |

## Landing (`index.tsx`)

Fully rewritten — see the page itself. Hero: "AI that knows when to
disappear." CTAs: "Start a working draft" / "See how it works". Closing:
"Leave the screen. Keep the thread."

## Auth (`auth.tsx`)

| Was                                     | Now                                       | Why                                |
| --------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Title "Sign in — Compose"               | "Sign in — Hardcopy Tools"                | Company-level page                 |
| "C" monogram                            | Folded-page glyph                         | Brand mark                         |
| "Sign in to access your workflow runs." | "Sign in to pick up your working drafts." | Calmer; matches product language   |
| "Sign up with an email and password."   | **retained**                              | Plain and accurate                 |
| Buttons, errors, Google flow            | **retained**                              | Functional controls; already clear |

## Dashboard (`dashboard.tsx`)

| Was                                                            | Now                                                  | Why                                         |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Kicker "Studio"                                                | "Hardcopy Draft"                                     | Product label replaces generic category     |
| "Your 20 most recent workflow runs."                           | "Your 20 most recent runs."                          | Slightly quieter; "run" retained (accurate) |
| "+ New piece"                                                  | "+ New draft"                                        | Terminology                                 |
| Empty state "No runs yet / Start one from the New piece page." | "No drafts yet / Start one from the New draft page." | Terminology                                 |
| "Create your first piece"                                      | "Start your first draft"                             | Terminology                                 |
| Table columns, StatusPill values                               | **retained**                                         | Technical state machine                     |

## New (`new.tsx`)

| Was                                                | Now                                                                     | Why                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Title "New piece — Compose"                        | "New draft — Hardcopy Draft"                                            | Terminology                                                 |
| H1 "New piece"                                     | "New draft"                                                             | Terminology                                                 |
| Intro "…The studio authors a writing brief…"       | "…prepares a structured working draft from the research in your voice…" | Reflects the loop; "studio" retired                         |
| "I have research" / "Research it for me"           | **retained**                                                            | Clear, accurate mode labels                                 |
| "Create piece →"                                   | "Prepare draft →"                                                       | Preferred territory; matches behavior (AI prepares a draft) |
| "Research & create →"                              | "Research & prepare →"                                                  | Same                                                        |
| Field labels Topic / Research / Attachments / Goal | **retained**                                                            | Accurate                                                    |
| Voice-profile warning                              | lightly reworded, same meaning                                          | Keeps the by-design refusal explicit                        |
| Upload limits, file hints                          | **retained**                                                            | Technical accuracy                                          |

## Profile (`profile.tsx`)

| Was                               | Now                         | Why                              |
| --------------------------------- | --------------------------- | -------------------------------- |
| Title "Profile — Compose"         | "Profile — Hardcopy Draft"  | Suffix                           |
| Kicker "Studio"                   | "Hardcopy Draft"            | Product label                    |
| H1 "Your voice"                   | **retained**                | Already on-brand                 |
| "…every piece you compose…"       | "…every draft you prepare…" | Terminology                      |
| "Dictate" button, presets, errors | **retained**                | Accurate; dictation is real here |

## Run detail (`runs.$runId.tsx`)

| Was                                                                             | Now                                                                                              | Why                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Title "Run — Compose"                                                           | "Run — Hardcopy Draft"                                                                           | Suffix                                                 |
| Kicker "Studio"                                                                 | "Hardcopy Draft"                                                                                 | Product label                                          |
| H1 "Run", "Run detail", timeline, stats                                         | **retained**                                                                                     | Technical concepts; renaming would confuse             |
| Status messages ("the agent is authoring the brief and synthesizing the piece") | "…preparing the brief and drafting the piece…"                                                   | Small alignment, same meaning                          |
| "Print this draft for pen markup, then type your annotations back here…"        | "Print this draft for pen markup, then return your annotations here…" (anchor examples retained) | "Return annotations" territory; instructions unchanged |
| "Ready → final draft PR", "Resynth", "Revise → final PR"                        | **retained**                                                                                     | Exact state-machine actions; accurate                  |
| "brief.md (generated)" tabs                                                     | **retained**                                                                                     | Real file names                                        |

## Print (`print.$runId.tsx`)

| Was                                              | Now                       | Why                           |
| ------------------------------------------------ | ------------------------- | ----------------------------- |
| Title "Print — Compose"                          | "Print — Hardcopy Draft"  | Suffix                        |
| Kicker "Studio"                                  | "Hardcopy Draft"          | Product label                 |
| H1 "Print for markup" + margins/anchors copy     | **retained**              | Already the brand's best copy |
| PDF filename                                     | **none set** — Save-as-PDF goes through the browser print dialog, which names the file from the document `<title>` (the piece title, falling back to `brand.product.name`) | No programmatic download exists |
| Print dialog hints (Letter, background graphics) | **retained**              | Functional                    |

## Billing (`billing.tsx`, `CreditBalance.tsx`, paywall banners)

Added with the credit system; written to the same register — clear, quiet,
never louder than the rest of the product.

| Surface                                            | Copy                                                                | Why                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Title / kicker                                     | "Billing — Hardcopy Draft" / "Hardcopy Draft"                        | Product-level page, standard suffix                                     |
| Unit of purchase                                   | **credits** — 1 credit = 1 generation, deep research = 2             | Matches the implemented ledger; never call them "tokens" or "points"    |
| Header chip (`CreditBalance.tsx`)                  | "N credits" (amber at ≤1)                                            | Status, not a sales pitch                                               |
| Out-of-credits banners (`new.tsx`, `runs.$runId.tsx`) | Calm amber banner + "Get credits" link to `/billing`               | The paywall is a door, not a slot machine                               |
| Checkout return                                    | success/canceled banners are **display only** — credits "appear when the payment is confirmed" | Honest: grants come from the Stripe webhook, never the redirect |
| Failed/cancelled run                               | Notes the credit hold was released                                   | A system failure never quietly costs the user a credit                  |
| Dictation 402 (`profile.tsx`)                      | "workspace AI credits — separate from the generation credits on your Billing page" | Two billing domains exist; the copy must not conflate them |

## Sessions (`sessions.tsx`, `sessions.$sessionId.tsx`)

| Was                                         | Now                  | Why                          |
| ------------------------------------------- | -------------------- | ---------------------------- |
| Titles "… — Compose"                        | "… — Hardcopy Draft" | Suffix                       |
| Kicker "Studio"                             | "Hardcopy Draft"     | Product label                |
| Everything else (cost tables, empty states) | **retained**         | Accurate accounting language |

## Explicitly not renamed

- **run, session, kind, branch, PR** — backend/state-machine vocabulary the UI
  reports truthfully.
- **brief.md, post.md, channels** — actual file paths in results.
- **Resynth / Ready / Revise** — dispatched action names.
- **MARKUP.md shorthand** (`S{n}P{m}`, symbols, directives) — an existing,
  documented system; the brand layer surfaces it, it does not redesign it.
