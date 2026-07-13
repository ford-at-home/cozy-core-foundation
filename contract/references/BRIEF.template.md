# Brief: <bundle-name>

> Required input for every `synthesize` run. No brief, no run.
>
> Copy this file to `.input/<bundle-name>/brief.md` in your work repo
> and fill in every field below. Empty fields are not allowed.
> See [`SKILL.md`](../SKILL.md) for resolution rules.

## Voice

<!--
Name of a voice file under ~/.me/voices/<name>.md (or <repo>/.me/voices/<name>.md
for a per-repo override). Example values: ford, will, client-acme.
The matching ~/.me/voices/<name>.anti.md is loaded too if present.
-->

<voice-name>

## Persona

<!--
One named persona, pulled from ~/.me/personas/<name>.md, OR written inline
below as a short paragraph. The persona is "who is reading this piece" — the
single human the synthesis aims at. Vague personas produce vague writing.
Examples: "skeptical-cto", "cofounder-on-the-fence", "me-in-six-months".
-->

<persona-name-or-inline-paragraph>

## Throughline

<!--
ONE sentence. What does the persona walk away with? Not what the piece is
about — what the piece does to them. If you can't write this in one
sentence, the piece isn't ready.
-->

<one-sentence-throughline>

## Channels

<!--
List of output formats to produce, one per line. Each channel must have a
definition at ~/.me/channels/<name>.md (length, register, format constraints).
Default channels: longform, tweet-thread, linkedin-spunky, newsletter-blurb.
-->

- longform

## Why this persona, why now

<!--
ONE paragraph. The stakes. Why does it matter that this lands for this
persona, right now? If you can't articulate stakes, the piece will read as
content. If you can, it will read as a letter from someone who cares.
This field is the one that does the most work; do not skip it.
-->

<one-paragraph-stakes>
