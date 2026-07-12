import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

/**
 * Single shared renderer so the on-screen view and the print document produce
 * identical HTML for the same markdown. Print fidelity depends on both paths
 * agreeing on structure — especially which blocks exist and in what order,
 * since the S{n}P{m} anchor counters in print.css count rendered blocks.
 */
export const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });

/** True when an inline token's children are only images (plus whitespace). */
export function isImageOnlyInline(inline: Token | undefined): boolean {
  if (inline?.type !== "inline" || !inline.children?.length) return false;
  let sawImage = false;
  for (const child of inline.children) {
    if (child.type === "image") sawImage = true;
    else if (child.type === "softbreak") continue;
    else if (child.type === "text" && child.content.trim() === "") continue;
    else return false;
  }
  return sawImage;
}

// Tag paragraphs that contain nothing but image(s) as figures. The markup
// contract (contract/references/MARKUP.md) says images are not addressable
// blocks, but markdown wraps a standalone image in <p>, which would otherwise
// consume an S{n}P{m} anchor and shift every later reference. print.css skips
// `.md-figure` when counting. Done here in the renderer (not with CSS :has())
// because CSS cannot distinguish `<p><img></p>` from `<p>text <img></p>`.
markdown.renderer.rules.paragraph_open = (tokens, idx, options, _env, self) => {
  if (isImageOnlyInline(tokens[idx + 1])) {
    tokens[idx].attrJoin("class", "md-figure");
  }
  return self.renderToken(tokens, idx, options);
};

/**
 * Plain-text content of the document's first heading (any level), for use as
 * the document title (running page header, PDF filename). Null when the
 * document has no heading.
 */
export function extractTitle(source: string): string | null {
  const tokens = markdown.parse(source, {});
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "heading_open") continue;
    const inline = tokens[i + 1];
    if (inline?.type !== "inline") return null;
    const text = (inline.children ?? [])
      .filter((t) => t.type === "text" || t.type === "code_inline")
      .map((t) => t.content)
      .join("")
      .trim();
    return text || null;
  }
  return null;
}
