import { describe, expect, it } from "vitest";
import { markdown, extractTitle } from "@/lib/markdown";
import { expectedAnchors } from "./anchor-reference";

describe("extractTitle", () => {
  it("takes the first heading", () => {
    expect(extractTitle("# The Title\n\nBody.")).toBe("The Title");
  });

  it("takes the first heading even when content precedes it", () => {
    expect(extractTitle("Lead-in paragraph.\n\n## Later Heading\n")).toBe("Later Heading");
  });

  it("flattens inline markup to plain text", () => {
    expect(extractTitle("# The *Quiet* Cost of `orphaned` Tools")).toBe(
      "The Quiet Cost of orphaned Tools",
    );
  });

  it("returns null when there is no heading", () => {
    expect(extractTitle("Just a paragraph.\n\nAnd another.")).toBeNull();
  });
});

describe("figure tagging (md-figure)", () => {
  it("tags an image-only paragraph", () => {
    const html = markdown.render("![alt text](https://example.com/x.png)");
    expect(html).toContain('<p class="md-figure">');
  });

  it("does not tag a paragraph mixing text and image", () => {
    const html = markdown.render("See ![alt](https://example.com/x.png) here.");
    expect(html).not.toContain("md-figure");
  });

  it("tags a paragraph of multiple images separated by line breaks", () => {
    const html = markdown.render(
      "![a](https://example.com/a.png)\n![b](https://example.com/b.png)",
    );
    expect(html).toContain('<p class="md-figure">');
  });
});

describe("expectedAnchors (MARKUP.md counting rule)", () => {
  it("labels headings S{n} and blocks S{n}P{m}, resetting per section", () => {
    const anchors = expectedAnchors(
      ["# One", "", "First.", "", "Second.", "", "## Two", "", "Third."].join("\n"),
    );
    expect(anchors.map((a) => a.anchor)).toEqual(["S1", "S1P1", "S1P2", "S2", "S2P1"]);
  });

  it("puts lead-in content before the first heading in section 0", () => {
    const anchors = expectedAnchors(["Lead.", "", "# First Heading", "", "Body."].join("\n"));
    expect(anchors.map((a) => a.anchor)).toEqual(["S0P1", "S1", "S1P1"]);
  });

  it("skips list items, including paragraphs inside loose items", () => {
    const anchors = expectedAnchors(
      [
        "# T",
        "",
        "Before.",
        "",
        "- loose item",
        "",
        "  second paragraph of item",
        "",
        "After.",
      ].join("\n"),
    );
    expect(anchors.map((a) => a.anchor)).toEqual(["S1", "S1P1", "S1P2"]);
  });

  it("counts a blockquote as one block regardless of its contents", () => {
    const anchors = expectedAnchors(
      ["# T", "", "> quote para one", ">", "> ```", "> code", "> ```", "", "After."].join("\n"),
    );
    expect(anchors.map((a) => a.anchor)).toEqual(["S1", "S1P1", "S1P2"]);
    expect(anchors[1].tag).toBe("blockquote");
  });

  it("skips image-only paragraphs but counts prose with inline images", () => {
    const anchors = expectedAnchors(
      [
        "# T",
        "",
        "![figure](https://example.com/f.png)",
        "",
        "Prose with ![x](https://example.com/x.png) inline.",
      ].join("\n"),
    );
    expect(anchors.map((a) => a.anchor)).toEqual(["S1", "S1P1"]);
  });

  it("counts code blocks and tables, skips horizontal rules", () => {
    const anchors = expectedAnchors(
      ["# T", "", "```", "code", "```", "", "---", "", "| a |", "| --- |", "| 1 |"].join("\n"),
    );
    expect(anchors.map((a) => ({ anchor: a.anchor, tag: a.tag }))).toEqual([
      { anchor: "S1", tag: "h1" },
      { anchor: "S1P1", tag: "pre" },
      { anchor: "S1P2", tag: "table" },
    ]);
  });
});
