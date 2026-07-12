Lead-in before any heading: this paragraph must take a zeroth-section anchor and
must not steal the first section slot from the heading below.

# Edge Cases: A Stress Document for the Print Pipeline

## Consecutive Headings

### Directly Nested

#### Even Deeper

No content separated the four headings above — each still takes its own section
number, and none may be stranded at the bottom of a page without content.

## Lists That Try to Steal Anchors

A tight list, whose items never count:

- first item
- second item with a nested list:
  - nested one
  - nested two
- third item

A loose list, whose items get wrapped in paragraph tags by the renderer — those
wrapped paragraphs must not consume anchors either:

- This loose item is a full paragraph.

  And this second paragraph belongs to the same item.

- Another loose item, with a blockquote inside it:

  > Quoted text inside a list item is not addressable.

1. An ordered loose item.

   With a trailing paragraph inside the item.

2. A second ordered item containing code:

   ```text
   code inside a list item does not count
   ```

The paragraph after the lists must resume the paragraph counter exactly where the
paragraph before the lists left off, plus one.

## Blockquotes as Single Blocks

> A quote with two paragraphs. The wrapper takes one anchor.
>
> The second paragraph inside the quote takes none.

> A quote containing a code block and a table:
>
> ```text
> fenced code inside a blockquote
> ```
>
> | a   | b   |
> | --- | --- |
> | 1   | 2   |
>
> > And a nested quote, which is also not separately addressable.

## Figures and Broken Images

![A standalone image resolves to a figure and takes no anchor](data:image/png;base64,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)

![This image is missing and must fail gracefully](https://images.internal.example.com/does-not-exist.png)

A paragraph that mentions an image inline ![tiny inline marker](https://images.internal.example.com/also-missing.png) keeps
its anchor, because it carries prose.

## Hostile Text

An unusually long word: Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft, followed by normal prose to check hyphenation and wrapping.

A long bare URL, which the renderer autolinks: https://docs.internal.example.com/engineering/platform/observability/how-to-configure-retention-policies-for-high-cardinality-metrics-without-blowing-the-budget?tab=advanced&revision=1842&highlight=downsampling

Multilingual text: Der schnelle braune Fuchs springt über den faulen Hund. Le renard brun rapide saute par-dessus le chien paresseux. Быстрая коричневая лиса прыгает через ленивую собаку. Ο γρήγορος καφέ αλεπού πηδά πάνω από το τεμπέλικο σκυλί.

## An Unusually Long Heading That Will Have to Wrap Across Multiple Lines While Keeping Its Anchor Aligned to the First Line

```text
A code block with one pathologically long line that must wrap rather than overflow the text block: --enable-feature=deterministic-pagination --profile=/var/lib/compose/profiles/default-with-a-very-long-name.json --log-format=json --log-destination=https://logs.internal.example.com/ingest/v2?tenant=compose&buffer=off
```

Final paragraph, so the document ends in prose rather than a code block.
