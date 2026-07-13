# UI Copy Map

Every user-facing label reviewed for the brand layer, with its disposition.
Rule: rename only where the new term accurately matches current behavior.
Technical concepts (runs, sessions, PRs, status machine) keep their names —
renaming them would misdescribe what the system does.

## Global chrome

| Location                                     | Was                      | Now                                                                          | Why                                   |
| -------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------- |
| Header wordmark (`_authenticated/route.tsx`) | "C" monogram + "Compose" | Folded-page glyph + "Hardcopy Tools"                                         | Company brand                         |
| Nav "Dashboard"                              | Dashboard                | **Projects**                                                                 | The list is now project-centric (pieces with stage labels), not raw runs |
| Nav "New piece"                              | New piece                | New project                                                                  | A start can be a draft or a research packet |
| Nav "Cost"                                   | Cost                     | **retained**                                                                 | Accurate, honest                      |
| Nav "Profile"                                | Profile                  | **retained**                                                                 | Accurate                              |
| Nav "Teach" (professors only)                | —                        | Teach                                                                        | Role-gated extra tab; hidden from students |
| Nav "Assignments" link (from `/new`)         | —                        | "Working from a class assignment? Join your course and start it there →"    | Discoverable without cluttering the nav |
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

## Dashboard (`dashboard.tsx`) — now "Projects"

Rewritten for the clarity pass: the page lists **projects** (pieces) with a
plain-language stage line derived in `src/lib/journey.ts`, instead of raw
run rows.

| Was                                  | Now                                                        | Why                                              |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| H1 "Dashboard", run table            | H1 "Projects", project list                                | Users think in projects, not runs                |
| Raw run kinds/statuses per row       | One humanized line per project ("Building your packet…", "Ready for your review") | Machine statuses stay on the run-detail timeline |
| Empty state                          | "No projects yet / Start your first project"               | Terminology                                      |
| StatusPill values                    | Plain-language labels from `runStatusLabel`; raw status in the tooltip | Honest and readable at once |

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

## Research-workflow naming system (internal → user-facing)

The research-packet loop introduced backend vocabulary that must never leak
into primary UI copy. The canonical mapping (labels implemented in
`src/lib/journey.ts` — `runStatusLabel`, `runActivityLabel`, `runKindLabel`,
`projectStageLabel`):

| Internal term                          | User-facing term                        |
| -------------------------------------- | ---------------------------------------- |
| OCR / handwriting recognition          | "reading your pages"                     |
| `packet_return` / return loop          | "Return your work" / "Returned pages"    |
| verification                           | "Check what was read"                    |
| `followup_research` run                | "Follow-up research"                     |
| revised packet (`version = n+1`)       | "Revised packet" with a "What changed" section |
| `document` run / .docx                 | "Final paper"                            |
| `presentation` run / .pptx             | "Class presentation"                     |
| `handwriting_profiles`                 | "Handwriting adaptation" (profile page)  |
| artifact / ingestion / reconciling / rendering | never in primary copy; run-detail technical timeline only |

## Project hub (`projects.$pieceId.tsx`)

The journey rail names the seven stages in student language: Research →
Print → Work on paper → Return your work → Check what was read → Follow-up
research (optional) → Final paper & presentation. One primary action per
stage; later stages stay hidden until reachable (progressive disclosure —
no follow-up controls before verification, no output formats before the
work is returned). Skipping follow-up research is an explicit, free choice.

## Return and verification (`return.$runId.tsx`, `verify.$runId.tsx`)

| Surface                    | Copy                                                                      | Why                                                        |
| -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| H1                         | "Return your work" / "Check the reading"                                   | Action language, no "upload/ingest/OCR"                     |
| Mode choice                | "How would you like to return your work?" — photos and dictation as equals | Neither path is a fallback                                  |
| Progress                   | "Reading page N of M…"                                                     | Says what the system is doing in plain words                |
| Retake rejection           | Named reasons (glare, blur, cropped page) with "Retake this page"          | Specific and recoverable, never a bare failure              |
| Verification               | Photo beside recognized text; low-confidence highlighted; corrections saved; explicit approval | Never presents guesses as confirmed |
| Cost honesty               | Returning and verifying are free; stated where relevant                    | Credit-honest copy rule                                     |

## Courses (`teach.tsx`, `assignments.tsx`)

Professor surface is titled "Teach" (create course → share join code →
assignments → roster progress in stage labels). Student surface is
"Assignments" (join by code, start a packet from an assignment — the
assignment's topic is authoritative and the UI says so). Professor UI is
invisible to students.

## Explicitly not renamed

- **run, session, kind, branch, PR** — backend/state-machine vocabulary the UI
  reports truthfully.
- **brief.md, post.md, channels** — actual file paths in results.
- **Resynth / Ready / Revise** — dispatched action names.
- **MARKUP.md shorthand** (`S{n}P{m}`, symbols, directives) — an existing,
  documented system; the brand layer surfaces it, it does not redesign it.
