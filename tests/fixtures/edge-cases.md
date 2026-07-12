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

![A standalone image resolves to a figure and takes no anchor](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0ODAiIGhlaWdodD0iMjQwIj48cmVjdCB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2U5ZTVkYyIvPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjQ0OCIgaGVpZ2h0PSIyMDgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzhhODI3MiIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iMjQwIiB5PSIxMjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMjIiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLCBzZXJpZiIgZmlsbD0iIzVhNTM0NCI+RmlndXJlOiBoYW5kb2ZmIGdhcDwvdGV4dD48L3N2Zz4=)

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
