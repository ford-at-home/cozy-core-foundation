# UI Copy Map

Every user-facing label reviewed for the brand layer, with its disposition.
Rule: rename only where the new term accurately matches current behavior.
Technical concepts (runs, sessions, PRs, status machine) keep their names —
renaming them would misdescribe what the system does.

## Global chrome

| Location | Was | Now | Why |
|---|---|---|---|
| Header wordmark (`_authenticated/route.tsx`) | "C" monogram + "Compose" | Folded-page glyph + "Hardcopy Tools" | Company brand |
| Nav "Dashboard" | Dashboard | **retained** | Accurate |
| Nav "New piece" | New piece | New draft | "Draft" is the product's unit of work |
| Nav "Cost" | Cost | **retained** | Accurate, honest |
| Nav "Profile" | Profile | **retained** | Accurate |
| Root `<title>`/OG (`__root.tsx`) | "Compose" / sign-in copy | "Hardcopy Tools \| AI That Knows When to Disappear" + brand meta description | Brand metadata |
| 404 / error pages | generic | **retained** (already calm and clear) | No brand value in touching them |

## Landing (`index.tsx`)

Fully rewritten — see the page itself. Hero: "AI that knows when to
disappear." CTAs: "Start a working draft" / "See how it works". Closing:
"Leave the screen. Keep the thread."

## Auth (`auth.tsx`)

| Was | Now | Why |
|---|---|---|
| Title "Sign in — Compose" | "Sign in — Hardcopy Tools" | Company-level page |
| "C" monogram | Folded-page glyph | Brand mark |
| "Sign in to access your workflow runs." | "Sign in to pick up your working drafts." | Calmer; matches product language |
| "Sign up with an email and password." | **retained** | Plain and accurate |
| Buttons, errors, Google flow | **retained** | Functional controls; already clear |

## Dashboard (`dashboard.tsx`)

| Was | Now | Why |
|---|---|---|
| Kicker "Studio" | "Hardcopy Draft" | Product label replaces generic category |
| "Your 20 most recent workflow runs." | "Your 20 most recent runs." | Slightly quieter; "run" retained (accurate) |
| "+ New piece" | "+ New draft" | Terminology |
| Empty state "No runs yet / Start one from the New piece page." | "No drafts yet / Start one from the New draft page." | Terminology |
| "Create your first piece" | "Start your first draft" | Terminology |
| Table columns, StatusPill values | **retained** | Technical state machine |

## New (`new.tsx`)

| Was | Now | Why |
|---|---|---|
| Title "New piece — Compose" | "New draft — Hardcopy Draft" | Terminology |
| H1 "New piece" | "New draft" | Terminology |
| Intro "…The studio authors a writing brief…" | "…prepares a structured working draft from the research in your voice…" | Reflects the loop; "studio" retired |
| "I have research" / "Research it for me" | **retained** | Clear, accurate mode labels |
| "Create piece →" | "Prepare draft →" | Preferred territory; matches behavior (AI prepares a draft) |
| "Research & create →" | "Research & prepare →" | Same |
| Field labels Topic / Research / Attachments / Goal | **retained** | Accurate |
| Voice-profile warning | lightly reworded, same meaning | Keeps the by-design refusal explicit |
| Upload limits, file hints | **retained** | Technical accuracy |

## Profile (`profile.tsx`)

| Was | Now | Why |
|---|---|---|
| Title "Profile — Compose" | "Profile — Hardcopy Draft" | Suffix |
| Kicker "Studio" | "Hardcopy Draft" | Product label |
| H1 "Your voice" | **retained** | Already on-brand |
| "…every piece you compose…" | "…every draft you prepare…" | Terminology |
| "Dictate" button, presets, errors | **retained** | Accurate; dictation is real here |

## Run detail (`runs.$runId.tsx`)

| Was | Now | Why |
|---|---|---|
| Title "Run — Compose" | "Run — Hardcopy Draft" | Suffix |
| Kicker "Studio" | "Hardcopy Draft" | Product label |
| H1 "Run", "Run detail", timeline, stats | **retained** | Technical concepts; renaming would confuse |
| Status messages ("the agent is authoring the brief and synthesizing the piece") | "…preparing the brief and writing the draft…" | Terminology |
| Research-complete banner ("The piece is now being composed… follow the compose run") | "Your draft is now being prepared… follow the drafting run" | Terminology (missed in the first pass) |
| "Print this draft for pen markup, then type your annotations back here…" | "Print this draft for pen markup, then return your annotations here…" (anchor examples retained) | "Return annotations" territory; instructions unchanged |
| "Ready → final draft PR", "Resynth", "Revise → final PR" | **retained** | Exact state-machine actions; accurate |
| "brief.md (generated)" tabs | **retained** | Real file names |

## Print (`print.$runId.tsx`)

| Was | Now | Why |
|---|---|---|
| Title "Print — Compose" | "Print — Hardcopy Draft" | Suffix |
| Kicker "Studio" | "Hardcopy Draft" | Product label |
| H1 "Print for markup" + margins/anchors copy | **retained** | Already the brand's best copy |
| Print dialog hints (Letter, background graphics) | **retained** | Functional |

(PDF filename: the print flow uses the browser's native Save-as-PDF dialog and
does not set a suggested filename — an earlier claim of `hardcopy-draft-<id>.pdf`
here described behavior that was never implemented.)

## Sessions (`sessions.tsx`, `sessions.$sessionId.tsx`)

| Was | Now | Why |
|---|---|---|
| Titles "… — Compose" | "… — Hardcopy Draft" | Suffix |
| Kicker "Studio" | "Hardcopy Draft" | Product label |
| Empty state "Start a piece… / Create a piece" | "Start a draft… / Start a draft" | Terminology (missed in the first pass) |
| Everything else (cost tables) | **retained** | Accurate accounting language |

## Billing & credits (`billing.tsx`, `CreditBalance.tsx`, paywall banners)

Added after the brand pass — the payments layer landed in a separate branch
and the original map never covered it.

| Surface | Copy | Why |
|---|---|---|
| `/billing` kicker + H1 | "Hardcopy Draft" / "Billing" | Product label + plain functional title |
| Intro | "Each generation uses 1 credit; a deep-research start uses 2… Printing… never uses credits." | States the real model incl. the free print boundary |
| Credits vs Cost note | one quiet line distinguishing `/billing` (credits) from `/sessions` (USD telemetry) | Two accounting systems must not blur |
| Header chip (`CreditBalance.tsx`) | coin + count, links to `/billing` | Calm; no urgency styling |
| Paywall banners (`new.tsx`, `runs.$runId.tsx`) | amber note + "Get credits →" link; buttons disable | Clear without being loud — no modal, no countdown |
| Ledger labels | "Welcome credits", "Generation", "Refund", "Chargeback", "Adjustment" | Human words for ledger entry types |
| Checkout return | success = "credits added as soon as Stripe confirms"; canceled = "you were not charged" | Honest about the webhook being the granting path |
| Dictation 402 (`profile.tsx`, `/api/transcribe`) | "Dictation is temporarily unavailable." | Bills the operator's workspace allowance, **not** user credits — never send users to `/billing` for it |
| Landing product section | one sentence: 3 welcome credits, 1/draft, 2/deep research, failures free | Landing claims must match the implemented model |
| Pack names Starter / Writer / Studio | **retained** (DB `credit_products` seed) | Commerce SKUs; note "Studio" coincides with the retired in-app kicker — flagged as an open naming decision in the README |

Tone rule: billing copy stays as quiet as the rest of the brand. State costs
plainly, never gamify, never count down, never interrupt a working session
with an upsell.

## Explicitly not renamed

- **run, session, kind, branch, PR** — backend/state-machine vocabulary the UI
  reports truthfully.
- **brief.md, post.md, channels** — actual file paths in results.
- **Resynth / Ready / Revise** — dispatched action names.
- **MARKUP.md shorthand** (`S{n}P{m}`, symbols, directives) — an existing,
  documented system; the brand layer surfaces it, it does not redesign it.
