---
name: voice-only
description: Voice and structure pass on a long-form draft without any paper markup. Use when the user asks to refactor, tighten, elevate, clean up, rewrite in their voice, or polish a draft. Restructures top-down, applies accent layers from the brief-named voice, scrubs AI tells per the paired anti-slop file. Does not require dictated edits — operates on the prose alone.
mode: polish
reads:
  - references/STORYTELLING.md
voice: required # synthesize resolves from brief.md's Voice field; ~/.me/voices/<name>.md + <name>.anti.md
triggers:
  - "refactor this draft"
  - "refactor this in my voice"
  - "rewrite this in my voice"
  - "tighten this post"
  - "tighten this draft"
  - "tighten this essay"
  - "clean up this transcript"
  - "elevate this draft"
  - "edit this blog post"
  - "make this read better"
  - "polish this"
---

# Bundle: voice-only

The bundle for **post-substance voice and structure work**. Use after the substance is right (or when the substance was already right and you just need a voice pass).

## When this bundle applies

Use this bundle when:

- The substance of the draft is fine; the prose needs voice and structure work.
- A rough draft, transcript, or set of notes needs to be elevated into a publishable piece.
- The user explicitly asks for refactoring, tightening, or polish — and is not invoking paper markup.

## When this bundle does NOT apply

- The user is dictating edits against a marked-up paper → **personal bundle**.
- The user wants a friction score, message compression, or a rollout plan →
  those come from the `ksp` / `comm-plan` sibling packages, which are **not
  vendored** in this repo (see `contract/README.md` "Not vendored"). Say so
  rather than improvising.
- The user asks for pure proofreading (typos, grammar only) with no structural changes. This bundle restructures.

## What this bundle does

Two modes, auto-detected from inputs:

### Refactor Mode

- Input: a rough draft, transcript, or notes.
- Output: an elevated version in the user's voice.
- Reorganizes top-down, not sentence-by-sentence.
- Improves clarity, logical flow, argument structure, pacing.
- Removes redundancy and filler.
- Reconstructs the piece so it reads as if written intentionally from the start.

### Creation Mode

- Input: only a topic, idea, or minimal seed.
- Output: a piece written from scratch in the user's voice.
- Starts from first principles.
- Progression: orient the reader → expand the idea → stress-test it → land the point.
- Favors original synthesis over generic explanation.

## References composed

| File                                                          | Role                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `~/.me/voices/<name>.md`                                      | The voice. Resolved from `brief.md`'s `Voice:` field. Accent layers applied sparingly per the voice file's "Accent layers" section. Loaded every invocation.                                                       |
| `~/.me/voices/<name>.anti.md`                                 | Paired anti-slop catalog. Scrubbed every invocation — even without an explicit SLOP directive, this bundle removes AI tells as part of normal voice work. Loaded if present.                                       |
| [`references/STORYTELLING.md`](../references/STORYTELLING.md) | Piece architecture (translated Chappelle). Governs top-down restructure: where to start, what the reader thinks they're reading, when to move the target, how the closer reframes the rest. Read every invocation. |

If the brief is missing a `Voice:` field or the named voice does not exist at `<repo>/.me/voices/<name>.md` or `~/.me/voices/<name>.md`, this bundle stops. See `../SKILL.md` for the resolution rule (in this product the voice arrives inline — `contract/README.md` override 1).

## Output format

See `../SKILL.md` "Output format — voice-only bundle" for the exact structure. Summary:

- The rewritten piece, complete and publishable.
- "What Changed (top-down)" — 3–5 bullets describing big-picture edits: structure shifts, argument tightening, cut sections, added framing. Not sentence-level diffs.
- "Voice Notes" — 1–3 bullets on which accent layers were used and where.

## Guardrails

- Do not compress for KSP. This bundle preserves density where density earns its place.
- Do not invent facts, claims, or examples the user didn't provide. Mark gaps `[Example needed: …]`.
- Do not water down strong opinions. Sharpen them.
- If the draft is already tight, say so in Voice Notes. Do not manufacture changes to justify invocation.
- Do not stack more than two accent layers in one piece.

## Failure handling

- Input is genuinely too short to refactor (< ~50 words, no discernible argument) → switch to Creation Mode and ask one question: "What do you want this to land as — a post, a memo, or a thread?"
- Input has multiple disjoint arguments → flag this in Voice Notes and either pick the strongest or ask the user which one leads.
- STYLE.md missing → stop, tell the user the plugin seems misconfigured, ask them to verify installation.
