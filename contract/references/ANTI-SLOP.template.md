# Anti-Slop: <voice-name>

> Pair with `<voice-name>.md`. This file catalogs the AI tells and other
> patterns that, when scrubbed, make a draft *more* like the named voice.
>
> Save filled-in anti-slop files to `~/.me/voices/<voice-name>.anti.md`
> alongside the voice file. Synthesize loads both automatically when a brief
> names that voice.
>
> See `examples/voices/ford.anti.md` (in this package) for a real-world
> example with rules and substitutions.

## Vague-authority tells

<!--
Words and constructions that signal "I read this in a content marketing
blog" rather than "I'm telling you what I know." Format each entry as:
RULE → SUBSTITUTION (or "cut" if it has no replacement).
-->

- "in today's fast-paced world" → cut
- "leveraging" → use the actual verb (build, ship, exploit, lean on)
- "in order to" → "to"
- "utilize" → "use"

## Even-cadence and listicle tells

<!--
Rhythmic patterns that signal AI-generated text. Examples:
- Three-item lists where two would do.
- Every sentence the same length.
- Even-clause paragraphs (always two clauses joined by a comma).

Add your own.
-->

- 
- 

## Hedge stack

<!--
Compound hedges that drain claims of force. Examples:
- "could potentially..."
- "may sometimes..."
- "in some cases might..."

Either cut the hedge or commit to a specific claim with a caveat
(but only one).
-->

- 
- 

## Throat-clearing

<!--
Sentences that warm up before saying anything. Common openers to delete:
- "It's important to note that..."
- "It's worth mentioning..."
- "First, let's consider..."
-->

- 
- 

## Empty connectives

<!--
Connectives that pretend to argue. Cut or replace with a real one.
- "Moreover" → cut or use specific evidence
- "Furthermore" → cut
- "Additionally" → cut
- "It is clear that" → cut, then prove it
-->

- 
- 

## Voice-specific allergies

<!--
Patterns this particular voice shouldn't use, even if other voices might.
Get specific to your voice — there's no universal list. Examples:
- "Industry-standard" (always vague — this voice names the vendor).
- Bullet points beyond three deep (this voice uses prose).
- Emoji (this voice doesn't, ever, except where ironic).
-->

- 
- 

## Notes

<!--
Anything that's hard to encode as a rule. Patterns you've caught yourself
scrubbing repeatedly. Drift to watch for.
-->

- 
