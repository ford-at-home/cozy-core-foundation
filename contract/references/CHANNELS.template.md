# Channel: <channel-name>

> A channel defines an output format: where the piece lands, what shape it
> needs to be in, and what register fits.
>
> Save filled-in channels to `~/.me/channels/<channel-name>.md` (or
> `<repo>/.me/channels/<channel-name>.md` for per-repo overrides) and
> reference them in your `brief.md`'s `Channels:` list.
>
> See `examples/channels/longform.md` (forthcoming) for a real worked example.

## Identity

<!--
One sentence. What this channel is, where it lives, and who reads it there.
Examples:
- "Long-form essay published on my personal blog, RSS-syndicated."
- "Tweet thread, 6-12 posts, max 280 chars per post."
- "LinkedIn post, spunky register, 1200-2000 chars, no thread."
- "Internal Slack #engineering, 200-400 words, often quoted in standups."
-->

<one-sentence-identity>

## Length

<!--
Numeric targets. Be specific. "Short" is useless; "180-280 words" is useful.
For multi-post formats (threads), state per-post AND total caps.
-->

- Target: <words/characters>
- Hard cap: <words/characters>
- Floor: <if too short, the channel doesn't make sense>

## Output filename

<!--
What synthesize should call the main output file under
`.output/<bundle>/<channel-name>/`. Defaults to `post.md` if unset.
Examples:
- `post.md` (longform)
- `thread.md` (tweet thread)
- `slack.md` (operational Slack post)
- `email.md`
-->

`<filename>.md`

## Register and tone

<!--
The audible texture this channel calls for. Distinct from voice (voice is
the writer's; register is the channel's). Two or three bullets.

Examples:
- Conversational opening, hard-claim middle, low-stakes closer.
- No headings; the piece must read top-to-bottom without scaffolding.
- Cold opening — no "Hi all," no warmup.
-->

-
-

## Format constraints

<!--
What the format physically allows and disallows. Examples:
- "No markdown headings — the platform strips them."
- "Inline links only; no footnotes; no images larger than 1MB."
- "Numbered lists OK; nested lists never."
- "Each post stands alone; no '1/n' prefix."
-->

-
-

## Failure modes

<!--
Specific ways drafts fail on this channel. Two or three bullets. Examples:
- "Reads like a press release — kills engagement immediately."
- "Opens with 'In today's fast-paced world' — channel-allergic to corporate
  hedge."
- "Uses Twitter-thread numbering ('1/8') in a context where threading is
  not the cultural default."
-->

-
-

## Notes

<!--
Anything else the synthesizer needs to know. Common additions:
- Platform-specific quirks (character counts, image sizes).
- Audience expectations (do they expect engagement-bait, or a clean read?).
- The piece's afterlife on this channel (does it get quoted? linked? buried?).
-->

-
