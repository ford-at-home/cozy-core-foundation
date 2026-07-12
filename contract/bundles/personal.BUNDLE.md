---
name: personal
description: Long-form posts iterated via printed-and-marked-up paper. Use when the user dictates edits against a target doc, synthesizes a new post from marked-up source materials, or otherwise applies the paper-markup vocabulary. Reads MARKUP for the symbol/handle/directive vocabulary, STORYTELLING for piece architecture, and KSP only when the KSP directive appears in markup. Voice (and its anti-slop) resolves per-run from the brief — see synthesize SKILL.md.
mode: edit-or-synthesis
reads:
  - references/MARKUP.md
  - references/STORYTELLING.md
  - references/KSP.md # only when the KSP directive appears
voice: required # synthesize resolves from brief.md's Voice field; ~/.me/voices/<name>.md + <name>.anti.md
triggers:
  - "apply my edits"
  - "merge my dictated changes"
  - "I just marked up"
  - "v2 of [doc] with my edits"
  - "here are my markup notes"
  - "compose from these sources"
  - "synthesize a new post from these"
  - "weave these into a post"
  - "draft something from these blog posts"
---

# Bundle: personal

The bundle for the author's own paper-driven writing workflow.

## When this bundle applies

Use this bundle when the input includes any of:

- A target document plus dictated edit instructions referencing pen-and-paper marks (numbered handles, symbols, named directives).
- A directory or list of source documents plus a dictated throughline for a new synthesis.
- An invocation that mentions printed markup, dictated edits, or paper-based revision.

In short: the loop is **print → mark up by hand → dictate → v2**.

## What this bundle does

Two operations, auto-detected from inputs:

### Edit mode

- Input: one target `.md` / `.txt` doc + dictated edits.
- Output: a new file at `<source>.v2.md` (auto-increments on subsequent passes) plus a "What I Changed" checklist (one bullet per dictated operation) plus an "Unresolved" list (anything that couldn't be matched — never silently skipped).
- Applies the user's edits **surgically**. Does not restructure or re-voice beyond what was asked.
- Resolves dictated references against the source in this order: by block anchor (`S{n}P{m}` / "section 4 paragraph 3" — the pre-printed margin labels from the app's print view), by hand-numbered handle (① ② ③), by symbol class ("all the strikethroughs"), or by content fuzzy-match ("the bit about ownership"). See `skills/synthesize/SKILL.md` step 4 for the resolution rule and `references/MARKUP.md` for the block-counting definition.

### Synthesis mode

- Input: 2+ source `.md` / `.txt` docs (file list, directory, or inline) + a dictated throughline.
- Output: a new draft at a sensible default path (skill picks; user can override via voice) plus a synthesis map showing which parts came from which source.
- Highlighted source passages are pulled verbatim; the rest is connective writing in the brief-named voice (`~/.me/voices/<name>.md`).

## References composed

> Paths below are relative to the composed plugin (`dist/plugin/`) where all sibling-package references live in a single `references/` directory. In monorepo source, `STORYTELLING.md` ships with `markdown-soul` and `KSP.md` ships with `ksp`; `make plugin` is how they become co-resident with this bundle's references.

| File                                                             | Role                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`references/MARKUP.md`](../../references/MARKUP.md)             | Source of truth for the markup protocol — symbols, numbered handles, all named directives. Read every invocation. Ships with this package.                                                                                                                                                                                                       |
| [`references/STORYTELLING.md`](../../references/STORYTELLING.md) | Piece-architecture philosophy (translated Chappelle). Governs _how the whole piece is built_ — casual entry, named gap between public posture and private knowledge, implicated narrator, reframing closer. Edit mode honors existing architecture; synthesis mode uses this to construct it. Read every invocation. Ships with `markdown-soul`. |
| `~/.me/voices/<name>.md`                                         | Voice texture for any connective writing or directive-driven expansion (DEEPEN, HOOK, LAND, etc.). Resolved from `brief.md`'s `Voice:` field. Loaded every invocation.                                                                                                                                                                           |
| `~/.me/voices/<name>.anti.md`                                    | Catalog of AI tells scrubbed by the SLOP directive. Resolved alongside the voice file. Loaded when SLOP appears in dictation.                                                                                                                                                                                                                    |
| [`references/KSP.md`](../../references/KSP.md)                   | Friction rubric. Read only when the KSP directive appears in markup (restructures the passage to Pulse / Catalyst / Context / Handoff). Ships with `ksp`.                                                                                                                                                                                        |

## Output format

See `skills/synthesize/SKILL.md` "Output format — personal bundle" for the exact structure. Summary:

- The transformed/new draft, complete and shippable.
- "What I Changed" or "Synthesis Map" (one bullet per dictated operation or per source-passage placement).
- "Unresolved" section if any reference couldn't be matched.
- The file path written.

## Voice-driven parameters

Paper carries directives. Voice carries parameters. See `references/MARKUP.md` for the full vocabulary. Quick reference:

- `DEEPEN` directive accepts: `hightower`, `yegge`, `bukowski`, `noonan`, `holmberg`
- `VISUALIZE` directive accepts: `diagram`, `infographic`, `sketch`
- Other directives are parameter-less unless voice specifies

## Failure handling

- No markup detected (neither symbols, handles, nor directives) → recommend the `voice-only` bundle and stop.
- Source not found → ask for the path; do not proceed.
- Dictation references a number that doesn't appear anywhere matchable → surface in "Unresolved" with closest candidates; never silently skip.
