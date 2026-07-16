import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { buildPrintDocument, extractPost } from "@/lib/print-document";
import { brand } from "@/config/brand";

describe("extractPost", () => {
  const result: Json = {
    channels: [
      { channel: "social", files: [{ name: "thread.md", content: "nope" }] },
      { channel: "longform", files: [{ name: "post.md", content: "# Hello" }] },
    ],
  };

  it("finds post.md across channels", () => {
    expect(extractPost(result)).toBe("# Hello");
  });

  it("returns null for missing or malformed results", () => {
    expect(extractPost(null)).toBeNull();
    expect(extractPost("string" as Json)).toBeNull();
    expect(extractPost({} as Json)).toBeNull();
    expect(extractPost({ channels: [{ files: [{ name: "other.md", content: "x" }] }] })).toBeNull();
  });
});

describe("buildPrintDocument", () => {
  // Inline code keeps its straight quotes (the typographer would smarten
  // quotes in plain text), so this exercises both HTML and CSS escaping.
  const source = '# A Title with `"quoted"` code & <angles>\n\nBody paragraph.';
  const doc = buildPrintDocument(source);

  it("is a self-contained English document with anchors enabled", () => {
    expect(doc).toContain('<html lang="en">');
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain('<body class="with-anchors">');
  });

  it("embeds all five font faces as data URIs", () => {
    expect(doc.match(/data:font\/woff2;base64,/g)).toHaveLength(5);
    expect(doc).toContain('font-family: "Source Serif 4"');
    expect(doc).toContain('font-family: "Source Code Pro"');
  });

  it("inlines the print stylesheet with Letter page geometry", () => {
    expect(doc).toContain("size: letter");
    expect(doc).toContain("margin: 1.5in 2in 1.5in 0.5in");
    expect(doc).toContain('counter(page) " of " counter(pages)');
  });

  it("escapes the title for the <title> element and the running header", () => {
    expect(doc).toContain(
      "<title>A Title with &quot;quoted&quot; code &amp; &lt;angles&gt;</title>",
    );
    expect(doc).toContain('content: "A Title with \\"quoted\\" code & <angles>";');
  });

  it("suppresses the running header on the first page", () => {
    expect(doc).toContain("@page :first");
  });

  it("prints the full markup key: marks, edits, dials, directives, example, avoid-note", () => {
    for (const label of ["Marks", "Edits", "Dials", "Directives", "Refer", "Example", "Avoid"]) {
      expect(doc).toContain(`<span class="markup-legend-label">${label}</span>`);
    }
    // The six symbols with their meanings.
    expect(doc).toContain("✓ keep");
    expect(doc).toContain("✗ cut");
    expect(doc).toContain("~ rework (say how)");
    expect(doc).toContain("★ expand");
    expect(doc).toContain("→ move (say where)");
    expect(doc).toContain("? unsure");
    // Scope, replacement, insertion, approval-by-default.
    expect(doc).toContain("underline or circle words to narrow it");
    expect(doc).toContain("strike the old words");
    expect(doc).toContain("caret ^ at the spot");
    expect(doc).toContain("unmarked = unchanged");
    // What NOT to draw.
    expect(doc).toContain("writing over the margin anchors, inventing symbols");
  });

  it("repeats a minimal symbol reminder in the bottom-left margin, off on page 1", () => {
    expect(doc).toContain("@bottom-left");
    expect(doc).toContain('content: "✓ keep ✗ cut ~ rework ★ expand → move ? unsure"');
    // print.css turns the box off on the first page, where the legend sits.
    const firstPageRule = doc.slice(doc.indexOf("@page :first"));
    expect(firstPageRule).toContain("@bottom-left");
    expect(firstPageRule).toContain("content: none");
  });

  it("stamps a per-page document identifier when a documentId is provided", () => {
    const withId = buildPrintDocument(source, {
      documentId: "0a1b2c3d-ffff-4444-aaaa-999999999999",
    });
    expect(withId).toContain("@top-right");
    expect(withId).toContain('content: "draft 0a1b2c3d"');
    // Without an id there is no top-right box at all (nothing to attribute).
    expect(doc).not.toContain("@top-right");
  });

  it("trims very long titles in the running header to keep clear of the doc ref", () => {
    const longTitle = "# " + "An Extremely Long Title About Orphaned Tools And Their Costs";
    const built = buildPrintDocument(`${longTitle}\n\nBody.`);
    expect(built).toContain("…");
    expect(built).not.toContain(
      'content: "An Extremely Long Title About Orphaned Tools And Their Costs"',
    );
    // Truncation splits on code points: an astral char at the cut must not
    // leave a lone surrogate in the header.
    const astral = "# " + "𝔄".repeat(50);
    const builtAstral = buildPrintDocument(`${astral}\n\nBody.`);
    expect(builtAstral).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("uses an empty running header when the document has no heading", () => {
    const untitled = buildPrintDocument("Just a paragraph.");
    expect(untitled).toContain(`<title>${brand.product.name}</title>`);
    expect(untitled).toContain('content: "";');
  });

  it("is deterministic: same input, same document", () => {
    expect(buildPrintDocument(source)).toBe(doc);
  });
});
