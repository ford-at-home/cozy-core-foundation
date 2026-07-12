import { markdown, isImageOnlyInline } from "@/lib/markdown";

/**
 * Reference implementation of the S{n}P{m} block-anchor counting rule from
 * contract/references/MARKUP.md "Pre-printed block anchors".
 *
 * The production rule is implemented with CSS counters in
 * src/styles/print.css; the revision agent independently applies the same
 * rule when resolving voice references like "S4P3". This walker recomputes
 * the expected sequence from markdown-it tokens so tests can pin the CSS
 * rendering to the contract: if either side drifts, the fidelity suite fails.
 *
 * Counted (top-level blocks only, in document order):
 *   - headings (h1-h6): bump the section counter, labeled "S{n}"
 *   - paragraphs, blockquotes (the wrapper), code blocks, tables: bump the
 *     paragraph counter, labeled "S{n}P{m}"
 * Not counted: anything nested in a list item or blockquote, image-only
 * paragraphs, images, horizontal rules.
 */
export type AnchorRef = { anchor: string; tag: string };

export function expectedAnchors(source: string): AnchorRef[] {
  const tokens = markdown.parse(source, {});
  const out: AnchorRef[] = [];
  let section = 0;
  let para = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Tokens at level > 0 are nested inside another block (blockquote, list
    // item, ...) and are not addressable.
    if (t.level !== 0) continue;
    switch (t.type) {
      case "heading_open":
        section += 1;
        para = 0;
        out.push({ anchor: `S${section}`, tag: t.tag });
        break;
      case "paragraph_open": {
        if (isImageOnlyInline(tokens[i + 1])) break; // figure, not addressable
        para += 1;
        out.push({ anchor: `S${section}P${para}`, tag: "p" });
        break;
      }
      case "blockquote_open":
        para += 1;
        out.push({ anchor: `S${section}P${para}`, tag: "blockquote" });
        break;
      case "table_open":
        para += 1;
        out.push({ anchor: `S${section}P${para}`, tag: "table" });
        break;
      case "fence":
      case "code_block":
        para += 1;
        out.push({ anchor: `S${section}P${para}`, tag: "pre" });
        break;
      default:
        break;
    }
  }
  return out;
}
