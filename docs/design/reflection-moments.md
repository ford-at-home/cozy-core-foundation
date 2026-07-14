# Reflection moments — a design proposal

Status: **proposal** (design only). No reflection screens are wired into the
product yet; visual assets/animations will be supplied separately. This
document is the specification a future PR follows when those assets arrive.

## Why this fits Hardcopy Draft specifically

This is not a generic "add delightful interstitials" exercise. The brand
(`docs/brand/BRAND.md`) already argues for exactly one kind of pause:

- **"AI that knows when to disappear." / "Leave the screen. Keep the thread."**
- **"Slowness can improve thought"** — deliberate, in service of reflection.
- **"Technology should recede."**
- Motion rule: **"Almost none. Respect `prefers-reduced-motion`… nothing that
  increases screen time for atmosphere's sake."**

A reflection moment here is therefore a **quiet threshold**, never a reward
ceremony. The strongest ones sit exactly where the product's whole premise
lives: the seam between *screen work* and *paper thinking*. If a proposed pause
adds screen time without marking a real change of mode, it is wrong for this
product and should be cut.

Vocabulary already exists and must be reused, not re-invented: the six shared
verbs **Explore → Print → Think → Return → Refine → Finish**
(`src/config/workflow-copy.ts`) and the packet stage model
(`src/lib/packet-stage.ts`). Reflection copy should ride these seams, not
introduce a parallel language.

---

## 1. Screen classification

| Screen | Route / file | Classification | Note |
| --- | --- | --- | --- |
| Landing | `/` `index.tsx` | No reflection needed | Marketing; already paced. |
| Auth | `/auth` `auth.tsx` | No reflection needed | Transactional. |
| Dashboard | `/dashboard` | **Reflection-adjacent (orientation)** | Already a map. At most a *returning* line, not a screen. |
| New project | `/new` | Focus | Configuring the request. Pause belongs *after* submit, not here. |
| Project hub | `/project/$pieceId` | **Hybrid → should host, not become, reflections** | The stepper is orientation; each stage boundary is a candidate seam. Keep the hub; let stage cards carry brief pauses. |
| Packet questions | `/packet/$runId` | Focus | Reading/editing tailored questions. |
| Print preview | `/print/$runId` | Focus (with a threshold) | Detailed preview; the *act of leaving to paper* is the seam, best marked just before arriving here. |
| Return work | `/return/$packetId` | Focus | Photographing/dictating. Demanding, hands-on. |
| Review / verify | `/review/$returnId` | Focus (most demanding) | Careful word-by-word confirmation. Pause belongs *after* it, not during. |
| Follow-up | `/followup/$packetId` | Focus | Composing up to three questions. |
| Run detail | `/runs/$runId` | **Hybrid that should be simplified** | Live progress + technical timeline + outputs + next-step actions in one scroll. The *in-flight* state is the part to calm. |
| Cost / sessions | `/sessions`, `/sessions/$id` | No reflection needed | Accounting. |
| Billing | `/billing` | No reflection needed | Money. Brand rule: billing never gamifies. |
| Profile | `/profile` | No reflection needed | Configuration. |

**Hybrid to simplify:** the *active-run* region of `/runs/$runId`
(`activeStatusMessage` + technical timeline) reads as a machine console during
the one moment the user should be encouraged to look away. It doesn't need a
new screen — it needs its busy technical detail demoted (already collapsed
behind "Technical details") and its waiting copy reframed as a threshold (see
theme **construction** below).

---

## 2. Transition opportunities (strongest first)

Only boundaries where the user's **mental mode actually changes** qualify. Each
entry: previous state → next state, purpose, presentation, justification.

### T1 — Screen → paper (the defining seam)
- **Previous:** research/packet just completed; the user has been *watching a
  machine work*.
- **Next:** review the tailored questions, print, and **step away from the
  screen** to think on paper.
- **Purpose:** mark the handoff of ownership from AI to author; permission to
  leave.
- **Presentation:** **brief inline pause** on the hub **Print** stage card
  (packet) and above the dictation/print block on a completed **draft** run
  (longform). Non-blocking; the existing primary action is the continue.
- **Why justified:** this is the product's whole thesis. The mode change (lean
  in → step out) is real and worth one calm line. This is the single most
  important reflection moment in the app.

### T2 — Paper → system (after returning work)
- **Previous:** the user just **submitted** photographed pages / dictation —
  the effortful, physical part is over.
- **Next:** wait while handwriting is read, then verify.
- **Purpose:** a genuine exhale after a submission, plus honest reassurance
  that waiting is safe and free.
- **Presentation:** **brief reflection screen** shown once on submit, before
  the `recognizing` state. Full (not merely inline) because it follows a
  completed action and precedes a wait.
- **Why justified:** "after submitting something" + "when the user's mental
  mode needs to change" (doing → waiting).

### T3 — Narrow → wide (after verification, before follow-up)
- **Previous:** finished **verification** — meticulous, word-level, high-focus
  work.
- **Next:** a strategic choice: research deeper, or finish.
- **Purpose:** widen the lens; move from correctness to intent.
- **Presentation:** **brief inline pause** atop the **Follow-up** stage card.
- **Why justified:** "after completing a difficult task" + "before a more
  demanding/strategic decision." The cognitive gear-change (detail → direction)
  is exactly what a threshold serves.

### T4 — Completion (final artifact ready)
- **Previous:** the last generation finished; the document exists.
- **Next:** download and leave.
- **Purpose:** mark a milestone quietly and let the screen recede.
- **Presentation:** **brief inline pause**, shown **once** when the Word
  document first becomes ready (persist a "seen" flag; never re-show).
- **Why justified:** "after reaching a milestone." Must resist becoming a
  reward ceremony — no confetti, one line, then the download.

### T5 — Returning after absence (optional, weakest)
- **Previous:** the user was away (paper thinking, or days).
- **Next:** resume at the current stage.
- **Purpose:** re-orientation.
- **Presentation:** **brief inline line** at the top of the hub on the first
  load after a gap (e.g. > 8h since last visit, stored locally). Not a screen.
- **Why justified:** "when returning after an absence." Kept minimal because the
  stepper already orients; this only adds warmth, so it must stay a whisper or
  be cut.

### Deliberately **not** reflection moments
- `/new` submit → generation: the run/hub already shows a live state; add a
  calm *line* (theme **construction**), not a pause. (Inline only.)
- Proposal completed → Ready/Resynth (longform): a decision, but the
  `ActionsPanel` already frames it; a pause here would just delay. **Nothing.**
- Between scrolling questions, between verification blocks, page-to-page in a
  return: same mode throughout. **Nothing.**
- Any **failure/cancel** state: needs clarity and a fix path, never poetry.
  **Nothing.**

---

## 3. Reflection concepts

Each concept: primary message (≤3 short lines), optional secondary line,
described motion (secondary to the pause; supplied later), continue label,
dismissal behavior. Copy is calm, concrete, no exclamation marks, no second-
person cheerleading.

### C1 — Screen → paper (T1)
```
The reading is done.
The page is yours now —
take it somewhere quiet.
```
- **Secondary:** "Reviewing and printing cost nothing."
- **Motion:** a folded-corner page (the brand dog-ear) settling into place, once.
  Reduced-motion: the folded page, static.
- **Continue:** packet → "Review the questions"; draft → "Print this draft".
- **Dismiss:** on action. No auto-advance.

### C2 — Paper → system (T2)
```
Your marks are in.
The system reads slowly
so you don't have to.
```
- **Secondary:** "You can leave and come back — nothing is lost."
- **Motion:** a single line drawing itself left-to-right, one pass (a page being
  read). Reduced-motion: the completed line.
- **Continue:** "Wait here" (stays, becomes the recognizing state) or, once
  ready, "See what it read".
- **Dismiss:** auto-resolves into the review step when recognition completes; or
  on action.

### C3 — Narrow → wide (T3)
```
The details are settled.
The next question is larger:
what still needs asking?
```
- **Secondary:** "Follow-up research is optional."
- **Motion:** a small diagram gently assembling into a wider shape (the view
  pulling back), once. Reduced-motion: the assembled shape.
- **Continue:** "Consider follow-ups" / secondary text link "Go to the final
  document".
- **Dismiss:** on action.

### C4 — Completion (T4)
```
The pieces found their places.
What began as research
now reads as yours.
```
- **Secondary:** "Downloading is free, as often as you like."
- **Motion:** a small light switching on and holding, once. Reduced-motion:
  light on.
- **Continue:** "Download the Word document".
- **Dismiss:** on action; shown only the first time the document is ready.

### C5 — Returning after absence (T5)
```
You stepped away.
The work waited here,
where you left it.
```
- **Secondary:** "You're at {stage}." (from the stage model)
- **Motion:** clouds passing over a small landscape, one slow pass. Reduced-
  motion: static landscape.
- **Continue:** "Continue" (scrolls to the current stage card).
- **Dismiss:** brief inline banner; auto-fades after the first interaction.

### C6 — In-flight, look away (construction; inline only, not a screen)
```
The system is working.
You don't have to watch.
It keeps the thread.
```
- **Secondary:** "This page updates on its own."
- **Motion:** a subtle one-action loop — a character briefly looking up from its
  work, then back. Reduced-motion: still frame.
- **Continue:** none (it is the waiting state); the existing "Watch progress" /
  heartbeat remains.
- **Dismiss:** replaced automatically when the run finishes.

---

## 4. Reusable message system

A small theme set so pauses stay coherent and never repeat verbatim. Themes map
to the seams above; each has a few interchangeable lines. Suggested home:
`src/config/reflection-copy.ts` (imported by a shared `<ReflectionPause>` when
assets land), sitting beside `workflow-copy.ts`.

| Theme | Where it recurs | Example line (one of several) |
| --- | --- | --- |
| **orientation** | hub load, dashboard return | "The map is here. The walking is yours." |
| **discovery** | research completes | "Sources gathered. The shape is still yours to find." |
| **uncertainty** | low-confidence review gate | "Some words are unsure. Only you can settle them." |
| **construction** | any in-flight run (C6) | "Something useful is taking shape." |
| **revision** | draft/revision returns | "One version rests. The next one listens for your marks." |
| **completion** | final artifact ready (C4) | "What began as research now reads as yours." |
| **readiness** | screen → paper (C1) | "The page is yours now — take it somewhere quiet." |
| **perspective** | review → follow-up (C3) | "The next question asks for a wider view." |
| **returning** | after an absence (C5) | "The work waited here, where you left it." |
| **moving deeper** | follow-up dispatched | "You asked for more. The digging starts where you pointed." |

Proposed shape (drop-in when animations arrive; **not yet added to the app**):

```ts
// src/config/reflection-copy.ts  (proposed — do not add until assets exist)
export type ReflectionTheme =
  | "orientation" | "discovery" | "uncertainty" | "construction"
  | "revision" | "completion" | "readiness" | "perspective"
  | "returning" | "moving_deeper";

export type Reflection = {
  theme: ReflectionTheme;
  /** ≤ 3 short lines, no exclamation marks. */
  message: readonly string[];
  /** One optional line — usually an honest reassurance (free / not lost). */
  secondary?: string;
  /** Described motion; the asset is supplied separately and stays secondary. */
  motion: string;
  /** The single continue action; empty for pure waiting states. */
  action?: string;
  /** How the pause ends. Never gates real work. */
  dismiss: "on-action" | "auto-on-ready" | "brief-inline";
};

// Keyed by boundary id (T1…T6) so a screen requests one reflection, once.
export const REFLECTIONS: Record<string, Reflection> = { /* C1…C6 */ };
```

Rotation rule: pick per boundary, not at random; vary the *line* within a theme
across repeat visits so the same user never reads the identical message twice in
one project.

---

## 5. Restraint rules (when NOT to use these)

1. **One seam, one mode change.** No pause between two screens in the same
   cognitive mode (scrolling questions, paging through a return, block-by-block
   verification).
2. **Once per boundary per project.** Persist a "seen" flag. A threshold you
   cross daily stops being a threshold.
3. **Never a disguised spinner.** If there is nothing real to wait for or decide,
   there is no pause. Reflection must not mask latency or manufacture ceremony.
4. **Never on failure.** Errors, cancellations, and out-of-credits states get
   clarity and a next step, never a poem.
5. **Never on money or config.** Billing, cost, auth, profile stay transactional
   (brand rule: billing never gamifies, never interrupts a session with tone).
6. **Always passable instantly.** A visible continue action (or an auto-resolve).
   The brand forbids adding screen time for atmosphere — a pause you cannot cross
   immediately is a defect.
7. **Reduced-motion is a first-class path,** not a fallback: a calm static frame,
   same message, same action.
8. **Three lines, no cheerleading.** No "Great job", "Keep going", "Success",
   exclamation marks, or motivational-poster cadence. Connect to the specific
   transition or say nothing.
9. **Collapse collisions.** If two boundaries land together, show only the later
   one.
10. **Opt-out sticks.** If a user dismisses/disables reflections, remember it.

The goal is rhythm: concentration, then a quiet threshold, then concentration
again — pauses that feel like doorways, not decorations.
