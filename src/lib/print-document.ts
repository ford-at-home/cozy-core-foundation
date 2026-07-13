import { markdown, extractTitle } from "@/lib/markdown";
import type { Json } from "@/integrations/supabase/types";
import { brand } from "@/config/brand";
// Printable-draft stylesheet; its S{n}P{m} block-anchor counting rule must
// stay in sync with contract/references/MARKUP.md.
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
 * Static furniture (the page-number footer and the per-page markup reminder)
 * lives in print.css.
 *
 * `docRef` is a short stable document identifier ("draft 1a2b3c4d",
 * "packet 5e6f7a8b · v2") printed top-right on EVERY page — including the
 * first — so any single scanned or photographed page can be attributed to
 * its exact document and version. */
function pageFurnitureCss(title: string | null, docRef: string | null): string {
  // The header shares the top strip with the document ref; a very long title
  // would collide with it (nowrap keeps the strip to one line), so trim to a
  // budget that fits typical titles at 8.5pt. (Character-count budgets are
  // approximate — a pathological all-wide-glyph title can still reach the
  // ref, which is acceptable: the strip stays legible, nothing clips.)
  // Split on code points, not UTF-16 units, so an astral character at the
  // cut never leaves a lone surrogate before the ellipsis. Note the header
  // deliberately centers on the full top strip (no text-column padding like
  // the folio has): padding would push long titles into the @top-right ref.
  const chars = title ? [...title] : [];
  const headerTitle =
    title && chars.length > 44 ? `${chars.slice(0, 43).join("").trimEnd()}…` : title;
  return [
    "@page {",
    "  @top-center {",
    `    content: "${headerTitle ? escapeCssString(headerTitle) : ""}";`,
    '    font-family: "Source Serif 4", Georgia, "Times New Roman", serif;',
    "    font-size: 8.5pt;",
    "    letter-spacing: 0.08em;",
    "    text-transform: uppercase;",
    "    white-space: nowrap;",
    "    color: #666666;",
    "  }",
    ...(docRef
      ? [
          "  @top-right {",
          `    content: "${escapeCssString(docRef)}";`,
          '    font-family: "Source Code Pro", Menlo, Consolas, monospace;',
          "    font-size: 7pt;",
          "    letter-spacing: 0.02em;",
          "    white-space: nowrap;",
          "    color: #999999;",
          "  }",
        ]
      : []),
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
// must not consume S1. A one-line reminder of the Marks row repeats in the
// @bottom-left margin box on pages after the first (print.css).
const MARKUP_LEGEND_HTML = `
<div class="markup-legend">
  <div class="markup-legend-title">Markup key</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Marks</span>✓ keep &middot; ✗ cut &middot; ~ rework (say how) &middot; ★ expand &middot; → move (say where) &middot; ? unsure — a margin mark applies to the whole block named by its anchor; underline or circle words to narrow it</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Edits</span>replace: strike the old words, write the new ones above or in the margin, join with a line &middot; add: caret ^ at the spot, new text in the margin &middot; unmarked = unchanged</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Dials</span>WC word choice &middot; REG register &middot; VOI voice &middot; RH rhythm — always signed: + more / – less, doubled = a lot (WC––)</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Directives</span>VIZ &middot; SLOP &middot; DEEPEN &middot; TIGHT &middot; KSP &middot; EX &middot; HOOK &middot; LAND &middot; PIVOT &middot; STAKES &middot; CLAIM &middot; SCENE &middot; EV &middot; CB &middot; ASIDE</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Refer</span>S{n}P{m} anchors are pre-printed in the left margin (&ldquo;S4P3: tighten&rdquo;) &middot; ① ② ③ = handles you number yourself &middot; highlight = use as-is</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Example</span>to swap one word in S3P4: strike it, write the new word above it, then dictate &ldquo;S3P4 — &lsquo;optimize&rsquo; becomes &lsquo;fix&rsquo;&rdquo;</div>
  <div class="markup-legend-row"><span class="markup-legend-label">Avoid</span>writing over the margin anchors, inventing symbols, or marks that touch no text &middot; X-out any note you do NOT want applied</div>
</div>`;

export interface PrintDocumentOptions {
  /** Stable document identifier (e.g. the run id) printed top-right on every
   *  page so a scanned page can be attributed; omitted when unknown. */
  documentId?: string | null;
}

/**
 * Build the complete, self-contained print document for a markdown piece.
 *
 * The result is used as an iframe `srcDoc`: everything the print engine needs
 * (fonts, stylesheet, page furniture) is inlined, so the document renders
 * identically on screen, in print preview, saved as PDF, and on paper — with
 * no network fetches and no dependency on the host page's styles.
 */
export function buildPrintDocument(source: string, opts: PrintDocumentOptions = {}): string {
  const title = extractTitle(source);
  const docRef = opts.documentId ? `draft ${opts.documentId.slice(0, 8)}` : null;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title ?? brand.product.name)}</title>`,
    `<style>${fontFaces}</style>`,
    `<style>${printCss}</style>`,
    `<style>${pageFurnitureCss(title, docRef)}</style>`,
    "</head>",
    '<body class="with-anchors">',
    MARKUP_LEGEND_HTML,
    markdown.render(source),
    "</body>",
    "</html>",
  ].join("\n");
}

// -----------------------------------------------------------------------------
// Research packet (docs/research-workflow/03-printable-packet.md).
//
// The packet document = packet body (markdown, S{n}P{m} anchors ON so
// findings are annotatable) + question blocks with real ruled writing space +
// three follow-up-research areas + handwriting guidance + return
// instructions. ALL packet furniture is divs/spans only: the anchor counters
// in print.css count p/headings/blockquote/pre/table, so question blocks
// consume zero anchors and the counting contract with
// contract/references/MARKUP.md is untouched. Questions are addressed by
// their printed Q{n} identifier instead.
// -----------------------------------------------------------------------------

export type PacketResponseSpace = "lines_3" | "lines_5" | "third_page" | "half_page" | "box";

export interface PacketPrintQuestion {
  position: number;
  /** Question function; "followup" renders as the follow-up-research section. */
  function: string;
  claim_ref: string;
  prompt: string;
  guidance: string | null;
  response_space: PacketResponseSpace;
}

export interface PacketPrintOptions {
  /** Packet id printed in the header (shortened for the page). */
  packetId: string;
  /** Packet version for the header stamp; null/undefined omits the stamp
   *  (degraded path where the packet row couldn't be read — printing a
   *  wrong "v1" on a revised packet would be worse than no stamp). */
  version?: number | null;
}

/** Ruled-line counts per writing-space size (0.35in per line — comfortable
 * handwriting). third_page ≈ 2.8in, half_page ≈ 3.85in of ruled space. */
const RESPONSE_LINE_COUNT: Record<Exclude<PacketResponseSpace, "box">, number> = {
  lines_3: 3,
  lines_5: 5,
  third_page: 8,
  half_page: 11,
};

const DEFAULT_CREDIBILITY_PROMPT =
  "What source, dataset, expert, institution, or type of evidence would make the answer credible?";

function responseAreaHtml(space: PacketResponseSpace): string {
  if (space === "box") return '<div class="response-box"></div>';
  const n = RESPONSE_LINE_COUNT[space];
  return `<div class="response-lines">${'<div class="response-line"></div>'.repeat(n)}</div>`;
}

function questionBlockHtml(q: PacketPrintQuestion, qNumber: number): string {
  const refLine = q.claim_ref
    ? `<span class="pq-ref">refers to ${escapeHtml(q.claim_ref)}</span>`
    : "";
  const guidance = q.guidance ? `<div class="pq-guidance">${escapeHtml(q.guidance)}</div>` : "";
  return [
    '<div class="packet-question">',
    `<div class="pq-head"><span class="pq-id">Q${qNumber}</span>${refLine}</div>`,
    `<div class="pq-prompt">${escapeHtml(q.prompt)}</div>`,
    guidance,
    responseAreaHtml(q.response_space),
    "</div>",
  ].join("\n");
}

function followupSectionHtml(q: PacketPrintQuestion | null, qNumber: number): string {
  const prompt = q
    ? escapeHtml(q.prompt)
    : "Which of this packet's findings deserves further investigation? Write up to three " +
      "follow-up research questions you want answered with authoritative evidence.";
  const credibility = escapeHtml(q?.guidance || DEFAULT_CREDIBILITY_PROMPT);
  const areas = [1, 2, 3]
    .map((n) =>
      [
        '<div class="packet-question packet-followup-area">',
        `<div class="pq-head"><span class="pq-id">${q ? `Q${qNumber}` : "F"}.${n}</span><span class="pq-ref">follow-up question ${n}</span></div>`,
        responseAreaHtml("lines_5"),
        `<div class="pq-guidance">${credibility}</div>`,
        responseAreaHtml("lines_3"),
        "</div>",
      ].join("\n"),
    )
    .join("\n");
  return [
    '<div class="packet-section">',
    '<div class="packet-section-title">Further research</div>',
    `<div class="pq-prompt">${prompt}</div>`,
    areas,
    "</div>",
  ].join("\n");
}

// Calm, non-judgmental guidance so recognition works; always offers the
// dictation alternative (docs/research-workflow/03, §handwriting guidance).
const HANDWRITING_GUIDANCE_HTML = `
<div class="handwriting-guidance">
  <div class="markup-legend-title">Writing your answers</div>
  <div class="handwriting-guidance-body">Another system will read this page later, so give it a fair chance: print clearly rather than using cursive where possible, use dark ink, write inside the response areas, keep page and question numbers visible, draw shorthand marks distinctly, cross out mistakes with a clear single line, and give arrows visible endpoints. If your handwriting is difficult to read, you may dictate your answers and reference the page number, question number, or annotation mark. The system will combine your dictation with the photographed pages.</div>
</div>`;

const RETURN_INSTRUCTIONS_HTML = `
<div class="packet-section packet-return">
  <div class="packet-section-title">Returning this packet</div>
  <div class="handwriting-guidance-body">When you have read, annotated, and answered on paper: photograph each completed page (one page per photo works best — whole page in frame, no glare, page number visible), then upload the photos in the app. Or dictate your answers, referencing page and question numbers. Blank space is fine; answer what earned your attention.</div>
</div>`;

function packetHeaderHtml(opts: PacketPrintOptions): string {
  const shortId = escapeHtml(opts.packetId.slice(0, 8));
  const stamp = opts.version != null ? ` · v${opts.version}` : "";
  return [
    '<div class="packet-header">',
    `<div class="packet-header-id">Research packet ${shortId}${stamp}</div>`,
    '<div class="packet-fields">',
    '<div class="packet-field"><span class="packet-field-label">Name</span><span class="packet-field-line"></span></div>',
    '<div class="packet-field"><span class="packet-field-label">Course</span><span class="packet-field-line"></span></div>',
    '<div class="packet-field"><span class="packet-field-label">Date</span><span class="packet-field-line"></span></div>',
    "</div>",
    "</div>",
  ].join("\n");
}

/**
 * Build the self-contained print document for a research packet. Same
 * renderer, geometry, fonts, and anchor rule as buildPrintDocument; the
 * packet adds writing space and question blocks as non-anchor furniture.
 */
export function buildPacketPrintDocument(
  source: string,
  questions: PacketPrintQuestion[],
  opts: PacketPrintOptions,
): string {
  const title = extractTitle(source);
  const docRef = `packet ${opts.packetId.slice(0, 8)}${opts.version != null ? ` · v${opts.version}` : ""}`;
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  // The first followup-function question shapes the "Further research"
  // section; any extras print as regular questions rather than vanishing.
  const followup = ordered.find((q) => q.function === "followup") ?? null;
  const regular = ordered.filter((q) => q !== followup);

  const questionBlocks = regular.map((q, i) => questionBlockHtml(q, i + 1)).join("\n");
  const questionsSection =
    regular.length > 0
      ? [
          '<div class="packet-section">',
          '<div class="packet-section-title">Questions for your written response</div>',
          questionBlocks,
          "</div>",
        ].join("\n")
      : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title ?? brand.product.name)}</title>`,
    `<style>${fontFaces}</style>`,
    `<style>${printCss}</style>`,
    `<style>${pageFurnitureCss(title, docRef)}</style>`,
    "</head>",
    '<body class="with-anchors">',
    packetHeaderHtml(opts),
    MARKUP_LEGEND_HTML,
    HANDWRITING_GUIDANCE_HTML,
    markdown.render(source),
    questionsSection,
    followupSectionHtml(followup, regular.length + 1),
    RETURN_INSTRUCTIONS_HTML,
    "</body>",
    "</html>",
  ].join("\n");
}
