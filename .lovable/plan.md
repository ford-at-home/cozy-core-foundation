
# Parity Check: Clarity & Simplification Brief vs. Current Code

Not an implementation plan — a map of where the brief's asks already exist, where they exist partially, and where they don't exist at all. Approve this and I'll turn the gaps into a scoped implementation plan.

## TL;DR

Most of the brief's **stage model, naming, and workflow narrative already exist** for the research-packet workflow (`/project/$pieceId`, `src/lib/packet-stage.ts`, `docs/research-workflow/`, `docs/brand/UI-COPY-MAP.md`). The big real gaps are: (1) the app runs **two parallel workflows** ("draft" and "research-packet") and top-level surfaces still lead with the draft one, (2) **transition copy between stages** is thin, (3) **professor role doesn't exist in the schema at all**, (4) **error/recovery copy** and **credit explanations at point-of-value** are inconsistent, (5) **printed packet return instructions** exist but haven't been audited against the brief's checklist.

## Legend

- ✅ Parity — implemented and consistent with the brief
- 🟡 Partial — exists but incomplete or inconsistent
- ❌ Gap — not implemented
- ⛔ Out of scope for this codebase (would require new features/schema — brief says "no new features")

## Phase-by-phase parity

### Core Product Promise & Core Experience
| Brief ask | Status | Where |
|---|---|---|
| One-sentence promise | 🟡 | `src/config/brand.ts` has `brand.meta.description` and `brand.product.descriptor`; both are draft-workflow-centric, not the "research → paper → return → refine → present" arc the brief wants. |
| 7-step human arc (Research → Print → Think → Return → Review → Follow-up → Present) | ✅ (packet flow) / 🟡 (landing) | `PACKET_STAGES` in `src/lib/packet-stage.ts` matches almost exactly (`research, print, think, return, review, follow_up, finish`). Landing page `HOW_IT_WORKS` in `src/routes/index.tsx` tells a *different* 7-step story (Research/Prepare/Print/Think by hand/Return your marks/Refine/Keep the result) — the draft workflow, not the packet workflow. |

### Phase 1 — Map existing workflow
| Brief ask | Status | Where |
|---|---|---|
| Full audit doc | ✅ | `docs/research-workflow/01-current-state-audit.md` + `BACKEND-CAPABILITY-MATRIX.md` already do this exhaustively. |
| Two workflows coexist and confuse | ❌ (not surfaced) | `pieces.workflow` = `longform` vs `research_packet`. Dashboard, `/new`, and landing don't distinguish or guide the choice; a first-time user won't know which they're starting. **This is the biggest information-architecture gap.** |

### Phase 2 — Main path vs. optional paths
| Brief ask | Status | Where |
|---|---|---|
| Progressive disclosure of return methods, follow-up, output formats | 🟡 | Project hub gates by derived stage, so downstream cards don't show until relevant. But `/return/$packetId` presents upload + dictation side-by-side without framing as "one decision", and follow-up doesn't have an explicit "Skip follow-up" affordance. |

### Phase 3 — Define 4–7 user-facing stages
| Brief ask | Status | Where |
|---|---|---|
| 4–7 stages, each with title/goal/primary action/completion/next | ✅ (structurally) / 🟡 (copy) | `STAGE_LABELS` + `derivePacketWorkflow` deliver 7 stages with one primary action each. Missing: one-sentence explanation per stage, explicit "completion condition", explicit "next-stage transition" copy. |

### Phase 4 — Naming audit
| Brief ask | Status | Where |
|---|---|---|
| Internal-to-user language map | ✅ | `docs/brand/UI-COPY-MAP.md` is exactly this artifact, already thorough for chrome/auth/dashboard/new/profile/run/print. |
| Consistent naming for packet, returned pages, review notes, follow-up, final paper, presentation | 🟡 | Packet workflow terms are consistent inside the packet hub. The **draft workflow still uses "piece" / "draft" / "revision" / "PR"** and those bleed into shared surfaces (Dashboard nav says "New draft"). The two vocabularies don't reconcile. |
| Retire "artifact"/"ingestion"/"reconciliation"/"rendering" as primary UI terms | 🟡 | `final_artifacts` naming still surfaces in some copy (`FINAL_ARTIFACT_COST`, project-hub Finish card). Not audited end-to-end. |

### Phase 5 — Clarify the beginning
| Brief ask | Status | Where |
|---|---|---|
| Landing page tells the full arc | 🟡 | Exists but tells the *draft* arc, not the packet arc, and doesn't say "what AI will not do". |
| First-use onboarding | ❌ | No onboarding surface. |
| `/new` explains the whole loop before starting | 🟡 | `/new` describes brief/draft prep only; doesn't preview return/review/follow-up/present. |
| Printable packet instructions | 🟡 | `buildPacketPrintDocument` in `src/lib/print-document.ts` renders instructions on the packet — not audited against the brief's checklist (read/respond/dark ink/shorthand/3 questions/photograph/dictate/return-checklist). |

### Phase 6 — Transition copy between stages
| Brief ask | Status | Where |
|---|---|---|
| End-of-stage "what happened / what's next / can I leave" copy at every hand-off | ❌ | Project hub renders per-stage status labels but no consistent transition messages. Six of the seven transitions the brief lists have no dedicated copy. |

### Phase 7 — Reduce cognitive load
| Brief ask | Status | Where |
|---|---|---|
| One primary action per stage, defaults, collapsed advanced | ✅ (hub) / 🟡 (deep pages) | Hub is disciplined. `/runs/$runId`, `/review/$returnId`, `/followup/$packetId` have multiple equal-weight controls; not audited against the "one primary action" rule. |

### Phase 8 — Branching clarity
| Brief ask | Status | Where |
|---|---|---|
| Return method as one decision | 🟡 | `/return/$packetId` shows both, not framed as a decision. |
| Follow-up skippable and explicit | 🟡 | Skip is technically possible (Finish is reachable without follow-up per `packet-stage.ts:85–86`) but not clearly labeled as "Skip". |
| Final output (docx / pptx / both) shown only after synthesis | ✅ | Project hub Finish card gates on prior stages. |
| Revised packet rendering strategy (full/addendum/replacement) not user-exposed | ✅ | Only one strategy exists; not user-choice. |

### Phase 9 — Status/progress
| Brief ask | Status | Where |
|---|---|---|
| Plain-language statuses instead of "processing/queued/rendering" | 🟡 | `StatusPill` still shows raw run states in some places (`/runs/$runId`, dashboard). Project hub uses friendlier labels but derives from those raw states. |
| Show current/completed/next/action-required/safe-to-leave | 🟡 | Stages show complete/current/upcoming; "safe to leave" and "action required" are not consistently signaled. |

### Phase 10 — Credits & payments at point-of-value
| Brief ask | Status | Where |
|---|---|---|
| Explain credit cost at the point of action | 🟡 | `CostBadge`, `useCreditBalance`, `isInsufficientCreditsError` exist. Costs are shown near action buttons in most places but the "one credit = complete research packet, one credit = follow-up (up to 3 questions), everything else free" narrative from the brief is not written down in one place a user sees. `docs/BILLING.md` is the internal source of truth. |
| Failure semantics for credits | ✅ (backend) / 🟡 (UI copy) | `docs/BILLING.md` guarantees reservation/release. User-facing recovery copy on failure is generic. |

### Phase 11 — Empty/error/recovery states
| Brief ask | Status | Where |
|---|---|---|
| "What happened / preserved / do next / credits / continue elsewhere" for every failure | 🟡 | Some paths good (blurred page reshoot on `/return/$packetId`, artifact settle on failure per `01-current-state-audit.md` item 5). Global audit not done. |

### Phase 12 — Printed instructions
| Brief ask | Status | Where |
|---|---|---|
| Return-process instructions on paper (checklist, shorthand legend, dark ink, 3 questions, photograph, dictate) | 🟡 | Print includes packet body + `S{n}P{m}` anchors + `contract/references/MARKUP.md` shorthand. A **final return checklist page** and dark-ink/photograph guidance haven't been verified in the print output. |

### Phase 13 — User-facing product language (16 surfaces)
| Surface | Status |
|---|---|
| 1–4 One-sentence / short / expanded / how-it-works | 🟡 (landing tells the wrong arc) |
| 5 Stage names + descriptions | ✅ names / ❌ descriptions |
| 6 New-project intro | 🟡 |
| 7 Printable packet instructions | 🟡 |
| 8 Upload & dictation instructions | 🟡 |
| 9 Verification explanation | 🟡 (`/review/$returnId` exists; explanatory copy not audited) |
| 10 Follow-up explanation | 🟡 |
| 11 Final output explanation | 🟡 |
| 12 Professor-facing explanation | ⛔ (no professor role in schema) |
| 13 Student-facing explanation | 🟡 |
| 14 Credit explanation | 🟡 |
| 15 Error/recovery copy | 🟡 |

### Phase 14 — UX flow spec
| Brief ask | Status |
|---|---|
| High-level + detailed + screen-by-screen + entry/exit + save-return + error paths | 🟡 — `docs/research-workflow/01…09` cover most; no consolidated single-source flow diagram. |

### Phase 15 — Implement clarity layer
Not applicable to parity check — this is where the follow-up implementation plan would land.

### Phase 16 — Validate with representative users
❌ — No validation artifacts in repo.

## Two things the brief assumes exist that don't

1. **Professor role / assignments / enrollments.** Brief mentions "professor controls", professor-facing copy, and "professor may require follow-up". Per `BACKEND-CAPABILITY-MATRIX.md` §1: `courses`, `assignments`, `enrollments`, `app_role='professor'` — **all missing**. Would require new schema + RLS + UI. The brief also says "do not add features". These conflict — needs a decision.
2. **A single workflow.** The brief describes one linear product; the codebase has two (`longform` draft workflow and `research_packet` workflow) that share chrome, `pieces`, `agent_runs`, credits, and print. The clarity work only lands cleanly after a decision about which workflow the product foregrounds — or how the two are named and separated on the landing/`/new`/dashboard surfaces.

## What I'd propose next (if you approve this parity map)

A scoped implementation plan for the 🟡 items in Phases 3, 5, 6, 8, 9, 10, 11, 12, 13 — no new features, no schema changes, no professor role. Two decisions I'd need from you first:

1. **Workflow foregrounding.** Does the landing page + `/new` + dashboard become **research-packet-first** (matches this brief), **draft-first** (matches current copy), or **explicit two-mode chooser**?
2. **Professor scope.** Drop from clarity pass entirely, or add a follow-on plan to build the schema?
