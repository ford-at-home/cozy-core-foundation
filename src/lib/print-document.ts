import { markdown, extractTitle } from "@/lib/markdown";
import type { Json } from "@/integrations/supabase/types";
import { brand } from "@/config/brand";
// Paper-markup stylesheet; its S{n}P{m} block-anchor counting rule must stay
// in sync with contract/references/MARKUP.md.
import printCss from "@/styles/print.css?raw";
// Fonts are embedded as data URIs so the printed document uses the exact same
// faces on every OS. Font metrics drive line breaks, and line breaks drive
// pagination — OS-dependent fallback fonts would make the same input paginate
// differently on different machines.
import serifRegular from "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?inline";
import serifItalic from "@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff2?inline";
import serifBold from "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2?inline";
import serifBoldItalic from "@fontsource/source-serif-4/files/source-serif-4-latin-700-italic.woff2?inline";
import monoRegular from "@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff2?inline";

/** Extract the printable piece (post.md) from an agent run's result payload. */
export function extractPost(result: Json | null): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const channels = (result as Record<string, unknown>).channels;
  if (!Array.isArray(channels)) return null;
  for (const ch of channels as Array<Record<string, unknown>>) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files as Array<Record<string, unknown>>) {
      if (f?.name === "post.md" && typeof f.content === "string") return f.content;
    }
  }
  return null;
}

function fontFace(family: string, weight: number, style: string, dataUri: string): string {
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  font-style: ${style};`,
    `  font-weight: ${weight};`,
    `  src: url("${dataUri}") format("woff2");`,
    "}",
  ].join("\n");
}

const fontFaces = [
  fontFace("Source Serif 4", 400, "normal", serifRegular),
  fontFace("Source Serif 4", 400, "italic", serifItalic),
  fontFace("Source Serif 4", 700, "normal", serifBold),
  fontFace("Source Serif 4", 700, "italic", serifBoldItalic),
  fontFace("Source Code Pro", 400, "normal", monoRegular),
].join("\n");

function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Per-document page furniture. The running header carries the document title
 * and the bottom-right attribution carries the brand domain, so both are
 * generated here rather than living in print.css (brand strings come only
 * from src/config/brand.ts). The header is suppressed on page 1, where the
 * title itself is the first thing on the page. Defining the boxes at all also
 * tells Chromium to drop its own date/title/URL furniture on those edges.
 * Static furniture (the page-number footer) lives in print.css. */
function pageFurnitureCss(title: string | null): string {
  return [
    "@page {",
    "  @top-center {",
    `    content: "${title ? escapeCssString(title) : ""}";`,
    '    font-family: "Source Serif 4", Georgia, "Times New Roman", serif;',
    "    font-size: 8.5pt;",
    "    letter-spacing: 0.08em;",
    "    text-transform: uppercase;",
    "    color: #666666;",
    "    /* Center on the text column (see the split-margin note in print.css). */",
    "    padding-left: 1in;",
    "  }",
    "  @bottom-right {",
    `    content: "${escapeCssString(brand.company.domain)}";`,
    "  }",
    "}",
    "@page :first {",
    "  @top-center { content: none; }",
    "}",
  ].join("\n");
}

// Printed markup key. Content mirrors contract/references/MARKUP.md ("Quick
// Reference"); update both together. Divs/spans only — the S{n}P{m} anchor
// counters in print.css count p/headings/blockquote/pre/table, and the legend
// must not consume S1.
const MARKUP_LEGEND_HTML = `
<div class="markup-legend">
  <div class="markup-legend-title">Markup key</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Symbols</span>✓ keep &middot; ✗ cut &middot; ~ rework &middot; ★ expand &middot; → move &middot; ? weak</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Dials</span>WC word choice &middot; REG register &middot; VOI voice &middot; RH rhythm — always signed: + more / – less, doubled = a lot (WC––)</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Directives</span>VIZ &middot; SLOP &middot; DEEPEN &middot; TIGHT &middot; KSP &middot; EX &middot; HOOK &middot; LAND &middot; PIVOT &middot; STAKES &middot; CLAIM &middot; SCENE &middot; EV &middot; CB &middot; ASIDE</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Voice</span>&ldquo;WC&ndash; on S3P4 — &lsquo;optimize&rsquo;&rdquo; &middot; S{n}P{m} anchors pre-printed in margin &middot; ① ② ③ = your hand-numbered handles</div>
</div>`;

/**
 * Build the complete, self-contained print document for a markdown piece.
 *
 * The result is used as an iframe `srcDoc`: everything the print engine needs
 * (fonts, stylesheet, page furniture) is inlined, so the document renders
 * identically on screen, in print preview, saved as PDF, and on paper — with
 * no network fetches and no dependency on the host page's styles.
 */
export function buildPrintDocument(source: string): string {
  const title = extractTitle(source);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title ?? brand.product.name)}</title>`,
    `<style>${fontFaces}</style>`,
    `<style>${printCss}</style>`,
    `<style>${pageFurnitureCss(title)}</style>`,
    "</head>",
    '<body class="with-anchors">',
    MARKUP_LEGEND_HTML,
    markdown.render(source),
    "</body>",
    "</html>",
  ].join("\n");
}
