---
name: synthesize
description: The single transformation primitive in markdown-soul-kitchen. Takes Markdown content + a required brief.md (persona, voice, throughline, channels, stakes) + a constraint bundle and returns brief-faithful Markdown. REFUSES to run without a brief — voice resolves from ~/.me/voices/<name>.md, channels from ~/.me/channels/<name>.md. Outputs land in .output/<bundle>/<channel>/{post,to-research,tighten,unresolved,synthesis-map}.md. Bundles live in bundles/<name>/BUNDLE.md and declare non-voice references plus a mode (edit, synthesis, polish, compress). Use when the user asks to apply hand-marked edits to a draft, weave a new post from source materials, refactor or tighten a draft in their voice, elevate raw notes into a publishable piece, compress an operational message to KSP structure, rewrite for Slack, or any other "Markdown in → brief-faithful Markdown out" transformation. Trigger phrases include "apply my edits", "compose from these sources", "weave these into a post", "refactor this draft", "tighten this", "rewrite in my voice", "elevate this", "compress this", "KSP this". Auto-detects the appropriate bundle from input shape and dictation; user can name the bundle explicitly. Not for scoring (see ksp-score) or multi-channel rollout sequencing (see comm-plan).
---

# synthesize

The single transformation primitive in `markdown-soul`. One operation:

> **Markdown content in. Brief and voice applied. Constraint bundle applied. Markdown content out.**

Every voice, structure, and friction operation built on `markdown-soul` is the same shape, just with a different bundle. Bundles live in `bundles/<name>/BUNDLE.md` and are first-class. Users add new bundles to add new capabilities — no new skill code required.

## Required input: brief.md (persona-first contract)

Every run requires a `brief.md` in the work directory. **No brief, no run.** This is non-negotiable; refuse to proceed if it's missing.

The brief is a five-field structured input — see [`references/BRIEF.template.md`](../../references/BRIEF.template.md) for the template and field semantics. The fields are:

| Field | Required | Purpose |
|---|---|---|
| `## Voice` | yes | Names a voice file under `~/.me/voices/<name>.md` (or `<repo>/.me/voices/<name>.md` for per-repo override). The matching `<name>.anti.md` is loaded too if present. |
| `## Persona` | yes | One named persona or inline paragraph. Who is reading this piece — *the* human, not a segment. |
| `## Throughline` | yes | One sentence: what does the persona walk away with? |
| `## Channels` | yes | List of output formats to produce (one or more). Each named channel must have a definition at `~/.me/channels/<name>.md`. |
| `## Why this persona, why now` | yes | One paragraph of stakes. The field that does the most work — it forces articulation of why this piece needs to exist. |

The brief lives at `.input/<bundle-name>/brief.md` in the user's work repo. The same directory contains the source materials (other `.md` files). See "Workflow" step 2 for resolution rules and "Failure handling" for refusal modes.

**Bullshit, operationally defined.** Any sentence in the output that does not move *this persona* toward *this throughline* is bullshit. The brief is what makes that judgement testable. Without it, "tighten" and "scrub" are vibes; with it, they're rules.

## Default bundles in the composed plugin

| Bundle | Ships in package | Mode | What it does |
|---|---|---|---|
| **`voice-only`** | `markdown-soul` (this package) | polish | Refactor a long-form draft in the brief-named voice. Restructure top-down, scrub AI tells. |
| **`personal`** | `paper-markup` | edit or synthesis | Apply dictated edits to a marked-up paper draft, OR weave a new post from marked-up source materials. |
| **`ksp-compress`** | `ksp` | compress | Compress an operational message to KSP structure (Pulse / Catalyst / Context / Handoff) and channel-appropriate length. |

Voice (and its paired anti-slop catalog) is no longer part of any bundle's `reads:` — it's resolved per-run from the brief. See "Required input: brief.md" above. Each bundle's `reads:` now lists only the *non-voice* references it needs (e.g., `STORYTELLING.md`, `MARKUP.md`, `KSP.md`).

See `bundles/<name>/BUNDLE.md` for the full description of each bundle's behavior, triggers, references, and output format. If a bundle from a sibling package isn't installed, the related triggers below won't apply — install the package or use the composed plugin under `dist/plugin/`.

## Use when

Trigger phrases (any of these route here; bundle is then chosen):

**personal bundle triggers:**

- "apply my edits to [doc]"
- "merge my dictated changes into [doc]"
- "I just marked up [doc], here are my notes"
- "v2 of [doc] with my edits"
- "compose from these sources"
- "synthesize a new post from these"
- "weave these into a post about [topic]"

**voice-only bundle triggers:**

- "refactor this draft"
- "refactor this in my voice"
- "tighten this post"
- "clean up this transcript"
- "elevate this draft"
- "rewrite in my voice"
- "make this read better"
- "polish this"

**ksp-compress bundle triggers:**

- "compress this"
- "tighten this message" / "tighten this for Slack"
- "KSP this"
- "rewrite this for Slack"
- "shorten this announcement"
- "make this Slack-ready"

**Explicit bundle invocation:**

- "synthesize with the [name] bundle"
- "use the [name] bundle"
- "compose using [name]"

## Do not use when

- The user wants a friction score on a message → **ksp-score** skill (no rewrite, just diagnostics).
- The user wants a multi-channel rollout sequenced → **comm-plan** skill.
- The user asks for pure proofreading (typos, grammar only) with no structural changes. This skill restructures.

## Required reading

Every invocation, in this order:

1. **`brief.md`** at `.input/<bundle-name>/brief.md`. Parse the five fields. Validate that every field has content. If any required field is empty, stop and ask the user to complete it — do NOT make up values.
2. **The voice file** named in `brief.md`'s `Voice:` field. Resolution order: `<repo>/.me/voices/<name>.md`, falling back to `~/.me/voices/<name>.md`. If present, also load `<name>.anti.md` from the same directory (paired anti-slop catalog). If the named voice doesn't exist at either path, stop and ask the user to either create it (copying [`references/STYLE.template.md`](../../references/STYLE.template.md)) or fix the brief.
3. **The channel definitions** named in `brief.md`'s `Channels:` list. Resolution: `<repo>/.me/channels/<name>.md`, falling back to `~/.me/channels/<name>.md`. Each missing channel → stop and ask.
4. **The bundle manifest** at `bundles/<name>/BUNDLE.md`. The bundle declares which references to read and which mode to run. Do not work from memory — the bundle file is the source of truth.
5. **The references the bundle declares** (`reads:` list in the bundle's frontmatter). Read all of them.

If the bundle file is missing → stop, tell the user the plugin seems misconfigured. Do not fall back to a generic operation.

If `brief.md` is missing → stop. See "Failure handling" for the exact refusal.

## Workflow

### 0. Load the brief and resolve voice + channels

Before anything else:

1. Read `.input/<bundle>/brief.md`. If it doesn't exist, **stop** (see Failure handling). If any required field is empty, stop and name the empty fields.
2. Resolve the `Voice:` named in the brief. Try `<repo>/.me/voices/<name>.md`, then `~/.me/voices/<name>.md`. Load the file. If `<name>.anti.md` exists at the same path, load it too.
3. Resolve each entry in `Channels:`. Try `<repo>/.me/channels/<name>.md`, then `~/.me/channels/<name>.md`. Load each.
4. Hold the persona, throughline, and stakes in working context — they govern every downstream judgment. The throughline is the test for "is this sentence pulling its weight?"

Brief, voice, and channels are now part of the constraint set for every subsequent step.

### 1. Choose the bundle

In order of precedence:

1. **Explicit reference.** If the user named a bundle ("synthesize with the voice-only bundle"), use it.
2. **Auto-detect from inputs.**
   - Markup vocabulary (numbered handles, symbols, named directives like `SLOP` / `DEEPEN` / `HOOK`) appears in dictation → **personal** bundle (edit mode).
   - Multiple source documents to weave + dictated throughline → **personal** bundle (synthesis mode).
   - Operational message + compression intent ("for Slack", "shorter", "compress") → **ksp-compress** bundle.
   - Long-form draft + voice intent ("refactor", "tighten", "elevate", "polish") and no markup → **voice-only** bundle.
3. **Ambiguous.** Ask one question and stop. Do not guess between bundles.

State the chosen bundle in the output ("Bundle: voice-only").

### 2. Read the bundle's references

Open `bundles/<name>/BUNDLE.md`. Parse its `reads:` frontmatter list. Read every declared file. These are the constraint set for the operation.

### 3. Detect the mode within the bundle

Some bundles support multiple modes (personal: edit-or-synthesis; voice-only: refactor-or-creation). Read the bundle's "What this bundle does" section to determine which mode applies based on inputs:

- One target doc + dictated edits → edit
- Multiple sources + throughline → synthesis
- Existing draft + voice intent → refactor
- Topic only → creation
- Single message + KSP intent → compress

### 4. Apply the constraint set

Follow the bundle's "What this bundle does" workflow. Common rules across bundles:

- Preserve user intent. Do not editorialize beyond what the bundle authorizes.
- Read references on every invocation. Do not work from memory.
- For markup directives (personal bundle): each directive looks up its backing reference (SLOP → the brief-named voice's `<name>.anti.md`, DEEPEN → the voice's accent layers, KSP → `references/KSP.md`, etc.).
- For voice work: apply the brief-named voice's accent layers sparingly; never stack more than two; default to clarity over flourish.
- For compression: respect channel-length targets from KSP.md's Channel Heuristics *and* any channel-specific overrides in the brief-named channel definition.
- **Throughline test.** For every paragraph (and every closing line of every paragraph), ask: does this move the persona toward the throughline? If no, it goes in `tighten.md` as a question for the writer ("This paragraph reads like context-setting — is it earning its place?") or gets cut.

**Resolving voice references (personal bundle).** When dictation points at a location, try resolution methods in this order, stopping at the first match:

1. **Block anchor** — *"section 4 paragraph 3"*, *"S4P3"*, *"section 4"* (for a heading itself). Count addressable blocks in the source document in document order: paragraphs, headings (h1–h6), blockquotes (whole quote = one block), code blocks, tables. Skip list items, images, horizontal rules, and any auto-generated title block. Every heading increments the section counter (`S{n}`) and resets the paragraph counter; every non-heading block increments the paragraph counter within the current section (`S{n}P{m}`). The section counter starts at 0, so the document's first heading is `S1`; any content before that first heading (rare) is `S0P1`, `S0P2`, …. This rule must match `scripts/print.css` exactly; if you find a discrepancy, stop and report it.
2. **Hand-numbered handle** — *"mark three"*, *"item 3"*. Match against numbered handles the user wrote on paper.
3. **Symbol class** — *"all the strikethroughs"*, *"the question marks"*. Match against the symbol type from MARKUP.md.
4. **Content** — *"the bit about ownership"*. Fuzzy-match against the prose.

If a reference resolves under multiple methods (e.g. "mark three" could be block S2P3 or hand-mark ③), prefer block-anchor resolution and note the ambiguity in *What I Changed*.

### 5. Write outputs to `.output/<bundle-name>/<channel>/`

Outputs go to a structured directory per the persona-first contract. **One run, one bundle, N channels → N output directories.**

```
<work-repo>/.output/<bundle-name>/<channel>/
├── post.md              # The piece itself (filename varies by channel — see channel def)
├── to-research.md       # Gaps the AI flagged: where the piece would be stronger with more sources, with hints on where to look
├── tighten.md           # Questions whose answers would let v(N+1) be tighter; the writer answers these in dictation or by editing brief.md
├── unresolved.md        # Any dictation reference or markup mark that couldn't be resolved; never silently dropped
└── synthesis-map.md     # (synthesis mode only) Which paragraphs came from which source
```

- The exact filename of the main output (`post.md`, `thread.md`, `email.md`, etc.) is named by the channel definition at `~/.me/channels/<name>.md`. Default is `post.md` if the channel doesn't specify.
- **Auxiliary files (`to-research.md`, `tighten.md`, `unresolved.md`) are always written, even if empty.** Empty files document that the agent considered the dimension and found nothing — that's information.
- `synthesis-map.md` is written only when the bundle ran in synthesis mode (multiple sources woven into one piece).
- For multi-channel briefs, one channel directory per channel listed. The base persona, voice, and throughline are shared; channel constraints (length, register, format) differ.

**Source files are never modified.** The original `.input/<bundle>/*.md` files stay clean. If you need to regenerate, delete `.output/<bundle>/` and re-run.

**Voice overrides** (kept from prior contract, still respected when expressed):

- *"Just show me"* / *"preview only"* / *"don't save"* — emit inline only, no files written. Useful for one-off experiments.
- *"Save to `<path>`"* — single-file override. Only valid for single-channel briefs.
- For single-channel briefs in inline mode, the auxiliary files (`to-research`, `tighten`, etc.) appear as labeled sections after the main output instead of as separate files.

### 6. Return the verification structure

See "Output format" below. Always include the bundle name in the output header.

## Output format

The structure varies by bundle but always includes a header naming the bundle.

### Output format — personal bundle (edit mode)

```
## v2 Draft (Bundle: personal · Edit Mode)

[The updated full document.]

---

## What I Changed

- [Edit 1: reference resolved + directive/action + result. One bullet per dictated operation.]
- ...

## Unresolved

- [Any operation that could not be resolved. Empty if none. This section is also emitted as the separate file `.output/<bundle>/<channel>/unresolved.md`.]

## Notes

- [Optional: assumptions made, parameter picks when voice was silent.]
```

The accompanying `to-research.md`, `tighten.md`, and `unresolved.md` files are written to the same `.output/<bundle>/<channel>/` directory. See "Write outputs" above for the full directory shape.

### Output format — personal bundle (synthesis mode)

```
## New Draft (Bundle: personal · Synthesis Mode)

[The synthesized full document.]

---

## Synthesis Map

- Hook: [source + paragraph reference + directive if any]
- Section 1: [source contributions]
- ...
- Close: [source + paragraph reference]

## What I Changed

- [Any directives applied during assembly.]

## Unresolved

- [Empty if none. Also emitted as `unresolved.md` in the channel output directory.]

## Notes

- [Optional: assumptions, parameter picks when voice was silent.]
```

The `synthesis-map.md` auxiliary file is required for synthesis mode and documents which paragraphs came from which sources, so the user can audit the weave without re-reading every source.

### Output format — voice-only bundle

```
## Rewritten Draft (Bundle: voice-only)

[The elevated piece. Full, publishable, in the user's voice.]

---

## What Changed (top-down)

- [3–5 bullets describing big-picture edits: structure shifts, argument tightening, cut sections, added framing. Not sentence-level diffs.]

## Voice Notes

- [1–3 bullets on which accent layers were used and where, so the user can calibrate.]
```

### Output format — ksp-compress bundle

```
## Compressed Rewrite (Bundle: ksp-compress)

**Channel (specified or inferred):** [Slack channel / email / DM / etc.]

**Length:** [word count] / [target range per KSP.md]

[The rewrite, with Pulse → Catalyst → Context → Handoff visible — either as labeled bullets or as natural prose that preserves the four moves.]

---

## Structural Moves

- [3–5 bullets: what you moved, cut, added, or restructured. Not word-level diffs.]
```

## Validation before returning

Before handing back the output, check:

- [ ] The bundle name is named in the output header.
- [ ] Brief was loaded and all required fields were present. Voice and channels resolved.
- [ ] Every paragraph in the output passes the throughline test, or is documented in `tighten.md` for the writer to revisit.
- [ ] Every dictated operation either landed (in "What I Changed") or surfaced (in `unresolved.md`). None silently dropped.
- [ ] Auxiliary files (`to-research.md`, `tighten.md`, `unresolved.md`) are written to `.output/<bundle>/<channel>/`, even if empty.
- [ ] Original source files in `.input/` are not modified.
- [ ] For every parameter the skill picked (because voice was silent), the pick is named in "Notes".
- [ ] No invented facts, statistics, examples, or sources. Gaps marked `[Example needed: …]` / `[Source needed: …]` and listed in `to-research.md`.
- [ ] No emoji unless the source used them.
- [ ] For ksp-compress: word count is within the target range for the named channel (per the channel's definition, with KSP.md as the fallback rubric). If not, compress further or escalate the channel in Structural Moves.

If any check fails, fix before returning.

## Guardrails

- **Brief is non-negotiable.** No brief, no run. Don't synthesize a brief from source materials; that's the exact failure mode the contract exists to prevent.
- **Persona is one human, not a segment.** Treat the persona as a real reader. If the brief gives a generic persona, push back — ask the user to name one.
- **Apply the bundle's rules, not your own.** Do not restructure top-down unless the bundle authorizes it (voice-only). Do not invent accent layers the user did not request. Do not "improve" beyond the bundle's scope.
- **Never silently skip.** Every dictated reference resolves or surfaces. Unresolved is a file (`unresolved.md`), not a fallback.
- **Never invent.** No fabricated examples, sources, quotes, or "the user probably meant…" inventions. Ask one question instead.
- **Never modify `.input/`.** Sources stay clean. All outputs go to `.output/<bundle>/<channel>/`.
- **One clarifying question maximum per turn.** If multiple ambiguities exist, queue them — pick the highest-impact question, ask it, return with partial results plus a "blocked on" note for the rest.
- **Do not auto-chain bundles.** Each invocation runs one bundle. If the user wants voice polish after edit-mode, they invoke synthesize again with the voice-only bundle. Composition is explicit.

## Failure handling

Refuse first; never substitute defaults for missing structured inputs. The bullshit-prevention contract depends on the brief being real.

- **`brief.md` not found** at `.input/<bundle>/brief.md` → stop. Point the user at [`references/BRIEF.template.md`](../../references/BRIEF.template.md). Do not run with a synthesized brief; do not infer fields from the source materials.
- **`brief.md` has empty required fields** (Voice, Persona, Throughline, Channels, Why this persona why now) → stop and name every empty field. Do not fill in defaults. Especially: do not invent a persona or throughline from the source materials — that defeats the purpose of the brief.
- **Voice named in brief not found** at `<repo>/.me/voices/<name>.md` or `~/.me/voices/<name>.md` → stop. Tell the user where the file should live and offer two options: (a) create it from [`references/STYLE.template.md`](../../references/STYLE.template.md), (b) change the brief's `Voice:` to an existing voice. List the voices that *do* exist at both paths.
- **Channel named in brief not found** at `<repo>/.me/channels/<name>.md` or `~/.me/channels/<name>.md` → stop. Same shape as voice failure: list available channels, offer to create or change.
- **Bundle file not found** → stop and ask which bundle to use, listing the available bundles in `bundles/`.
- **Bundle declares a reference that doesn't exist** → stop and report the missing file. Do not fall back to a heuristic.
- **No bundle could be auto-detected and the user did not name one** → list the available bundles with a one-line description of each, ask which to apply, do not guess.
- **Target doc not found** (edit mode) → ask for path or paste, do not proceed.
- **Source format unsupported** (binary, PDF, docx, image, URL) → stop and ask the user to convert upstream. Do not attempt OCR, fetch, or parse.
- **Dictation is contradictory** (e.g., "keep mark three" and "cut mark three") → surface the contradiction, do not pick a side.
- **Empty source directory** (synthesis mode) → stop and ask whether to scan recursively, change extension filter, or list explicit files.
- **`.output/<bundle>/<channel>/` already exists with non-empty files** → ask before overwriting. Default to `.output/<bundle>/<channel>.v2/` etc. if the user wants to keep prior runs.

## Example (personal bundle, edit mode)

**Inputs:**

- `.input/internal-tools/brief.md` with: `Voice: ford`, persona `skeptical-staff-eng`, throughline *"Internal tools rot from a handoff problem, not a documentation problem."*, channel `longform`, stakes paragraph on why this matters to engineers inheriting load-bearing legacy.
- `.input/internal-tools/draft.md` (single paragraph about internal tools dying from neglect).
- Dictation: *"Apply my edits. Mark one: tighten to 'reorgs blur ownership.' The slop just gets cut. The deepen: holmberg, Richmond newsroom analogy. The viz: a sketch of the handoff gap."*
- Paper marks on the printed draft: SLOP on "well-documented", DEEPEN at paragraph end, VIZ in margin, ① on "ownership becomes ambiguous".

**Output (abbreviated):**

```
## v2 Draft (Bundle: personal · Edit Mode)

Internal tools rot from neglect. Reorgs blur ownership. The result — load-bearing systems with no maintainer.

[Sketch: handoff gap between original engineer and inheriting team]

You know how every Richmond newsroom did this. Senior editor leaves, the syndication column nobody else touches just keeps publishing on autopilot for six months until somebody notices the bylines are dead.

---

## What I Changed

- Mark ①: "ownership becomes ambiguous" → "Reorgs blur ownership" (per voice: tighten).
- SLOP: "well-documented" cut (vague-authority tell per ANTI-SLOP.md).
- VIZ: `[Sketch: …]` placeholder added (per voice: sketch of handoff gap).
- DEEPEN: Holmberg-style aside, Richmond newsroom analogy (per voice: holmberg).

## Unresolved

- None.
```

(Plus `to-research.md`, `tighten.md`, `unresolved.md` written to the same channel directory. Source `.input/internal-tools/draft.md` is not modified.)
