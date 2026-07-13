# MARKUP.md — Pen-and-Paper Markup Protocol

A two-channel protocol for getting hand-marked paper edits into AI-readable form without typing.

- **Paper** carries the _address_ and the _intent type_. Marks are cheap — tiny symbols, short uppercase tokens, numbered handles.
- **Voice** carries the _content_. The user dictates substance; AI resolves references against the source doc.

This file is the source of truth for both the user's hand and the AI's interpretation. The `synthesize` skill reads it every invocation when running with the `personal` bundle (which covers the paper-markup workflow).

---

## Quick Reference (Print This)

### Symbols

| Mark | Means                     | Voice         |
| ---- | ------------------------- | ------------- |
| ✓    | keep verbatim             | none          |
| ✗    | cut                       | none          |
| ~    | rework                    | say how       |
| ★    | expand                    | say with what |
| →    | move                      | say where     |
| ?    | weak / challenge / unsure | optional      |

### Dials (signed adjustments)

Short uppercase tokens written in the margin beside the affected block,
**always signed**: `+` = more, `–` = less; double the sign for a strong push
(`WC––` = much plainer).

| Dial | Adjusts             | `+` means                  | `–` means            |
| ---- | ------------------- | -------------------------- | -------------------- |
| WC   | word choice         | richer, more specific      | plainer, simpler     |
| REG  | register            | more formal                | more casual          |
| VOI  | voice / personality | more of the author's voice | more neutral         |
| RH   | rhythm              | more varied, punchier      | steadier, calmer     |

A dial applies to the block it sits beside. Voice can narrow it to a word or
phrase: _"WC– on S3P4 — 'optimize'"_. With no voice, the AI applies the dial
to the whole block and reports the change.

### Numbered handles

**① ② ③ …** — anything you'll talk about in voice. Continuous across the doc, not per page.

### Highlighter

One color = **"use this as-is."** (Preserve in Edit Mode. Pull into new post in Compose Mode.)

### Directives

| Token               | Does                                             | Backed by                                             |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| **VISUALIZE** / VIZ | insert a visual                                  | STYLE.md visuals                                      |
| **SLOP**            | scrub AI tells, re-voice                         | ANTI-SLOP.md                                          |
| **DEEPEN**          | expand with accent layer                         | STYLE.md accents                                      |
| **TIGHTEN** / TIGHT | compress                                         | STYLE.md                                              |
| **KSP**             | restructure Pulse / Catalyst / Context / Handoff | KSP.md (not vendored here — surface in unresolved.md) |
| **EXAMPLE** / EX    | insert concrete example                          | STYLE.md                                              |
| **HOOK**            | rework as opener                                 | STYLE.md                                              |
| **LAND**            | rework as closer / punchline                     | STYLE.md                                              |
| **PIVOT**           | transitional bridge                              | STYLE.md                                              |
| **STAKES**          | make stakes explicit                             | STYLE.md                                              |
| **CLAIM**           | restate as one sharp line                        | STYLE.md                                              |
| **SCENE**           | concretize into a moment                         | STYLE.md + Noonan                                     |
| **EVIDENCE** / EV   | add citation / source                            | STYLE.md                                              |
| **CALLBACK** / CB   | reference earlier in the doc                     | STYLE.md                                              |
| **ASIDE**           | Holmberg-style parenthetical                     | STYLE.md                                              |

### Voice grammar — four ways to point at something

1. By **block anchor**: _"Section four paragraph three: …"_ / _"S4P3: …"_ — uses pre-printed `S{n}P{m}` labels.
2. By **hand-numbered handle**: _"Mark three: …"_ — uses `① ② ③` you wrote on the page.
3. By **symbol class**: _"All the strikethroughs: …"_
4. By **content**: _"The bit about X: …"_

Block anchors are the cheapest reference mode because they're already on the page.
Use hand-numbered handles when block anchors are too coarse (e.g. you want to point at one
sentence inside a long paragraph) or when anchors are off.

### Parameters

**Paper carries the directive. Voice carries the parameter.**

Paper: `DEEPEN`
Voice: _"the deepen on page two — yegge"_

- DEEPEN parameters: `hightower` / `yegge` / `bukowski` / `noonan` / `holmberg`
- VISUALIZE parameters: `diagram` / `infographic` / `sketch`

---

## Core Principle

> Paper marks are addresses. Voice fills in the verbs.

Anything that requires more than one or two words of writing belongs in voice, not on paper. Symbols and directives are short by design.

---

## Channel 1: Paper

### Symbols (6 primitives)

| Symbol | Meaning                    | Voice needed?   |
| ------ | -------------------------- | --------------- |
| **✓**  | Keep verbatim              | No              |
| **✗**  | Cut                        | No              |
| **~**  | Rework / rephrase          | Yes (how)       |
| **★**  | Expand here                | Yes (with what) |
| **→**  | Move                       | Yes (where to)  |
| **?**  | Weak / challenge / suspect | Optional (why)  |

Write symbols in the margin pointing at the affected text, or directly on it (e.g. strike-through for ✗).

A margin symbol defaults to the **whole block** it sits beside (the block the
pre-printed anchor labels). Underline or circle a word, phrase, or sentence and
attach the symbol to that stroke to narrow the scope. Replacement text is
written on paper directly: strike the old words and write the new ones above
the line or in the margin, connected with a line or caret (`^`) at the
insertion point — no symbol required. An unmarked block means "no change."

### Dials (signed adjustments)

Short uppercase tokens beside a block, **always signed**: `+` = more, `–` =
less; doubled = a strong push (`WC––` = much plainer).

| Dial    | Adjusts             | `+` means                  | `–` means        |
| ------- | ------------------- | -------------------------- | ---------------- |
| **WC**  | word choice         | richer, more specific      | plainer, simpler |
| **REG** | register            | more formal                | more casual      |
| **VOI** | voice / personality | more of the author's voice | more neutral     |
| **RH**  | rhythm              | more varied, punchier      | steadier, calmer |

A dial applies to the block it sits beside; voice can narrow it
(_"WC– on S3P4 — 'optimize'"_). With no voice, the AI applies the dial to the
whole block and reports its interpretation in the change log.

### What not to mark

To keep the page machine-readable after scanning:

- Don't write over the pre-printed `S{n}P{m}` anchor labels or the page
  furniture (header, folio) — they are how marks get located later.
- Don't invent new symbols or single letters; an unknown mark is surfaced as
  a question instead of being applied.
- Don't leave floating marks: every symbol, dial, or directive should
  visibly attach to a block, an underline/circle, or a handle. A mark that
  touches nothing becomes an "Unresolved" item, not an edit.
- Decorative doodles, brackets used as emphasis, and stray check-offs (e.g.
  ticking blocks as you read) are indistinguishable from intent. A ✓ means
  "keep verbatim" — don't use it as a reading progress mark.
- A note you do NOT want applied should be struck through with a single X
  before the page is returned; anything legible and unstruck is treated as
  input.

### Pre-Printed Block Anchors (`S{n}P{m}`)

When the app's print view renders with anchors on (the default), every addressable block in the
document gets a small label printed in the left margin. You don't need to write
anything on the page to use these — they're already there.

Two nested counters:

- **Section (`S{n}`)** — increments on every heading (any level, `h1`–`h6`). The heading
  itself is labeled `S{n}` alone; it _is_ the section, not a paragraph inside it.
- **Paragraph (`P{m}`)** — increments on every non-heading block within the current
  section and resets to 1 at each new heading. Labeled `S{n}P{m}`.

The section counter starts at 0, so the document's first heading becomes `S1` — matching
how you'd count sections by eye. Content before that first heading (rare) is `S0P1`,
`S0P2`, … rather than stealing the `S1` slot from the real first section.

**What counts as a block (in document order, continuous across pages):**

1. Paragraphs (`<p>`)
2. Headings (`<h1>`–`<h6>`) — these bump the section counter, not the paragraph counter
3. Blockquotes (the wrapper, not the blocks inside it — one anchor per quote)
4. Code blocks (`<pre>`)
5. Tables

**What does not count:**

- List items, and anything nested inside a list item — including the paragraphs that
  loose list items wrap their text in (the list as a whole is addressed by surrounding
  paragraphs or by content)
- Anything nested inside a blockquote (paragraphs, code blocks, tables — the quote is one block)
- Images — including a paragraph that contains nothing but an image
- Horizontal rules, inline elements
- Pandoc's auto-generated title block

The same rule lives in `src/styles/print.css`. If you change one, change both.

In voice, refer to these as `section 4 paragraph 3`, `S4P3`, or (for a heading itself)
`section 4` / `S4` — all resolve.

**When to use block anchors vs. hand-numbered handles:**

- **Block anchors (`S{n}P{m}`)** — default. No pen strokes needed. Coarse-grained:
  addresses a whole block.
- **Hand-numbered handles (`① ② ③`)** — when you need finer precision (one phrase inside a
  long paragraph), or when you printed without anchors.

You can mix both. A page can have `S3P2` (pre-printed) and `①` (hand-written) on the same
paragraph if you want to address the paragraph as a whole _and_ a specific line inside it.

### Numbered Handles (hand-written)

Use **① ② ③ …** (or `1`, `2`, `3` in a small circle) when you need finer precision than
the block anchor offers, or when block anchors are off.

- Numbers run **continuous across the doc**, not reset per page.
- The user does not need to plan ahead — just assign a number when they decide they'll talk about a spot.
- AI resolves by hand-number, falls back to content match if the number is ambiguous or the user forgets.

### Highlighter (one color)

Unified semantic, regardless of mode: **"use this content as-is."**

- **Edit Mode** (your own doc): preserve verbatim. Don't touch.
- **Compose Mode** (source docs): pull this into the new post.

A second color is reserved for future use. Do not invent meaning until a real need shows up.

### Directives (named operations)

Write as short uppercase tokens, in the margin or inline-circled. Each directive triggers a specific operation backed by a reference file.

| Directive             | Operation                                                                     | Backed by                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VISUALIZE** (`VIZ`) | Insert a visual marker. Voice picks type.                                     | STYLE.md "Visual Instinct" → `[Diagram: …]` / `[Infographic: …]` / `[Sketch: …]`                                                                                     |
| **SLOP**              | Scrub AI tells, re-voice per STYLE.md.                                        | ANTI-SLOP.md                                                                                                                                                         |
| **DEEPEN**            | Expand with an accent layer. Voice picks which.                               | STYLE.md accent layers                                                                                                                                               |
| **TIGHTEN** (`TIGHT`) | Compress. Cut filler. Bukowski-default.                                       | STYLE.md compression patterns                                                                                                                                        |
| **KSP**               | Restructure to Pulse / Catalyst / Context / Handoff.                          | KSP.md — **not vendored** in this repo; record the directive in `notes/unresolved.md` instead of restructuring from memory (see `contract/README.md` "Not vendored") |
| **EXAMPLE** (`EX`)    | Insert a concrete example. Voice can hint at flavor.                          | STYLE.md "concrete > abstract"                                                                                                                                       |
| **HOOK**              | Rework as opener.                                                             | STYLE.md "Paragraph Openings"                                                                                                                                        |
| **LAND**              | Rework as closer / punchline.                                                 | STYLE.md "Final Output Standard"                                                                                                                                     |
| **PIVOT**             | Transitional bridge between sections.                                         | STYLE.md "Argumentation Style"                                                                                                                                       |
| **STAKES**            | Make the stakes explicit.                                                     | STYLE.md "Argumentation Style"                                                                                                                                       |
| **CLAIM**             | Restate as one sharp declarative line.                                        | STYLE.md "Argumentation Style"                                                                                                                                       |
| **SCENE**             | Concretize abstract argument into a moment.                                   | STYLE.md "Visual Instinct" + Noonan accent                                                                                                                           |
| **EVIDENCE** (`EV`)   | Add citation / link / source. Flag `[Source needed: …]` if research required. | STYLE.md "Argumentation Style"                                                                                                                                       |
| **CALLBACK** (`CB`)   | Reference something earlier in the doc.                                       | STYLE.md "Dual Voice Mechanism"                                                                                                                                      |
| **ASIDE**             | Holmberg-style parenthetical.                                                 | STYLE.md "Mark Holmberg" accent                                                                                                                                      |

Abbreviations in parentheses are accepted shorthand. Use whichever fits your remaining pen-stroke budget.

---

## Channel 2: Voice

### Reference patterns

Voice can reference paper marks four ways. Use whichever is cheapest in the moment:

1. **By block anchor.** "Section four paragraph three: tighten to one sentence." / "S4P3: …"
2. **By hand-numbered handle.** "Mark three: …"
3. **By symbol class.** "All the strikethroughs: confirmed, just cut them."
4. **By content.** "The bit about ownership transfer — make it land harder."

The AI resolves all four in this order: block anchor → hand-numbered handle → symbol class → content. If multiple matches, it picks the best fuzzy match and flags it in the change log so the user can override on the next pass. If no match, it asks one question.

### Parameter convention

**Paper carries the directive. Voice carries the parameter.**

Paper: `DEEPEN` next to a paragraph.
Voice: "The deepen on page two — yegge."

If voice is silent on the parameter, AI picks from context per STYLE.md and reports its pick in the change log.

Available DEEPEN parameters (case-insensitive, fuzzy):

- `hightower` — clarity anchor
- `yegge` — insight + edge
- `bukowski` — raw compression
- `noonan` — cadence + moral weight
- `holmberg` — Richmond aside / lived-in texture

Available VISUALIZE parameters:

- `diagram` — relational / flow
- `infographic` — comparison / data
- `sketch` — illustrative / loose

### Loose grammar examples

All of these are valid dictation. Anchor by substance; AI does the matching.

- "Section two paragraph three: cut everything after the comma."
- "S3P1 through S3P4: tighten to half the length, keep the voice."
- "S5P2 is doing too much work — split it into two paragraphs."
- "Mark one: cut everything after the comma."
- "The starred bit on the second page — expand with a Tuesday example."
- "All the squiggles: just tighten them, you pick the words."
- "The deepen at the end — noonan, short and cold."
- "Where I talk about tools dying — change to 'rot.' Same throughout."
- "Mark five: move to right after the intro."
- "Strike everything I crossed out. Skip the question marks for now."
- "The viz on page three: flow diagram, three boxes."
- "Sources are post-a, post-b, post-c. Throughline: gap between intent and execution. Lead with the bit I highlighted in post-b."

---

## Worked Examples

### Edit Mode (your own doc)

**Printed paragraph:**

> Internal tools die from neglect. When teams reorg, ownership becomes ambiguous. The result is well-documented: load-bearing systems with no maintainer.

**Marks on paper:**

- `SLOP` next to "well-documented"
- `DEEPEN` circled at end of paragraph
- `VIZ` in margin
- ① near "ownership becomes ambiguous"

**Voice memo:**

> "Mark one: tighten to 'reorgs blur ownership.' The deepen: holmberg, Richmond newsroom analogy. The viz: a sketch of the handoff gap."

**Skill output:**

```
Internal tools rot from neglect. Reorgs blur ownership. The result — load-bearing systems with no maintainer.

[Sketch: handoff gap between original engineer and inheriting team, with the tool sitting orphaned in the middle]

You know how every Richmond newsroom did this. Senior editor leaves, the syndication column nobody else touches just keeps publishing on autopilot for six months until somebody notices the bylines are dead.

What I Changed:
- SLOP: "well-documented" → cut (vague-authority tell)
- Mark ①: "ownership becomes ambiguous" → "Reorgs blur ownership"
- VIZ: [Sketch: …] placeholder per voice direction
- DEEPEN: Holmberg aside, Richmond newsroom analogy
```

### Compose Mode (synthesize from sources)

**Sources marked up:** `post-a.md`, `post-b.md`, `post-c.md`. Highlighter on selected paragraphs in each. A few SLOP marks. A `HOOK` circled in post-b.

**Voice memo:**

> "Compose from these three. Throughline: gap between intent and execution. Use the hook from post-b. Pull every highlight. Drop everything in post-c except the closing image. Land on that image. Slop everything I marked."

**Skill output:**

```
[New draft synthesizing the three sources per the dictated throughline]

Synthesis Map:
- Hook: post-b S1P1 (HOOK directive)
- Section 1: post-a highlights, S2P1-S2P3
- Section 2: post-b highlights, S3P1-S3P3
- Aside: post-a highlight, S3P1
- Close: post-c S4P2 (closing image only)
- SLOP applied to: post-a S2P2, post-b S3P1, post-c S4P2

Saved to: drafts/intent-execution-gap.md
```

---

## Ambiguity Resolution

When a voice reference matches more than one candidate:

1. AI shows top 2–3 candidates.
2. AI picks the best fuzzy match and applies the edit.
3. The pick is flagged in "What I Changed" so the user can override on the next pass.

When a voice reference matches **zero** candidates:

1. AI emits an "Unresolved" section listing the reference and closest non-matches.
2. AI does **not** silently skip. Every dictated edit must either land or surface.

When a paper symbol has no voice content but requires it (e.g., `~` without a "how"):

1. AI applies its best guess per STYLE.md.
2. AI flags the guess in "What I Changed" and offers the alternative in the response.

---

## Failure Modes

- **Symbol with no clear referent.** Paper has a `~` floating in a margin, no text underlined. AI asks one question: "What does the squiggle on page 2 attach to?"
- **Directive with no parameter and no context.** `DEEPEN` with silent voice. AI picks an accent per the surrounding section, reports the pick, lets user override.
- **Numbered handle the voice never addressed.** User wrote ④ but never mentioned mark four in dictation. AI applies any associated symbol on its own; if there's no symbol, AI asks: "Mark four wasn't mentioned — leave as-is, or did I miss it?"
- **Source doc count doesn't match voice.** Voice says "three sources" but only two files are referenced. AI stops and asks.

---

## What This File is Not

- Not a comprehensive editorial guide. Voice arrives inline in this product
  (see `contract/README.md` override 1; `STYLE.template.md` shows the shape).
- Not a friction rubric. That was `KSP.md`, which is not vendored here.
- Not a channel strategy. Channels are supplied inline too
  (`CHANNELS.template.md` shows the shape).
- Not exhaustive — directives can be added. Each new directive must declare its backing reference file before it ships.
