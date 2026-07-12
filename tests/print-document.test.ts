import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { buildPrintDocument, extractPost } from "@/lib/print-document";

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

  it("uses an empty running header when the document has no heading", () => {
    const untitled = buildPrintDocument("Just a paragraph.");
    expect(untitled).toContain("<title>Hardcopy Draft</title>");
    expect(untitled).toContain('content: "";');
  });

  it("is deterministic: same input, same document", () => {
    expect(buildPrintDocument(source)).toBe(doc);
  });
});
