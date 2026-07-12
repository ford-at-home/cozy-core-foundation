import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";
import { buildPrintDocument } from "@/lib/print-document";
import { expectedAnchors } from "./anchor-reference";
import representative from "./fixtures/representative.md?raw";
import edgeCases from "./fixtures/edge-cases.md?raw";
import noHeadings from "./fixtures/no-headings.md?raw";
import { largeTableDocument, longDocument } from "./fixtures/generators";

/**
 * End-to-end print fidelity: render each fixture through the real pipeline
 * (buildPrintDocument → Chromium), then verify
 *   1. the CSS-counter anchors land on exactly the blocks the markup contract
 *      says are addressable (rendered ::before vs. the reference walker), and
 *   2. the print engine's PDF output (the same engine behind print preview,
 *      Save-as-PDF, and paper) carries the right anchors, page furniture, and
 *      pagination behavior.
 * The generated PDFs are kept in test-artifacts/print/ for visual QA.
 */

const FIXTURES: Record<string, string> = {
  representative,
  "edge-cases": edgeCases,
  "no-headings": noHeadings,
  "long-document": longDocument(30),
  "large-table": largeTableDocument(80),
};

const ARTIFACTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-artifacts/print",
);

let browser: Browser;

beforeAll(async () => {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function openFixture(source: string): Promise<Page> {
  const page = await browser.newPage();
  // The document must be self-contained; refuse the network so a fixture with
  // remote (or broken) images renders deterministically offline.
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(buildPrintDocument(source), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/** Anchors paint as standalone text runs; collect the items that are exactly
 * an S{n}[P{m}] token rather than regexing merged page text, where extraction
 * can jam an anchor against the neighboring prose. */
type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

async function pdfAnchors(pdf: PdfDocument): Promise<string[]> {
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = "str" in item ? item.str.trim() : "";
      if (/^S\d+(?:P\d+)?$/.test(str)) out.push(str);
    }
  }
  return out;
}

describe.each(Object.entries(FIXTURES))("fixture: %s", (name, source) => {
  const expected = expectedAnchors(source);

  it("anchors exactly the blocks the markup contract makes addressable", async () => {
    const page = await openFixture(source);
    try {
      const rendered = await page.evaluate(() => {
        const els = Array.from(
          document.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, pre, table"),
        );
        return els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          content: getComputedStyle(el, "::before").content,
        }));
      });
      const anchored = rendered.filter((r) => r.content !== "none");
      // Same blocks, in the same order, as the contract's counting rule.
      expect(anchored.map((r) => r.tag)).toEqual(expected.map((e) => e.tag));
      for (const a of anchored) {
        expect(a.content).toContain("counter(section)");
        if (a.tag.startsWith("h")) expect(a.content).not.toContain("counter(para)");
        else expect(a.content).toContain("counter(para)");
      }
    } finally {
      await page.close();
    }
  });

  it("produces a print-engine PDF whose anchors and page furniture are correct", async () => {
    const page = await openFixture(source);
    try {
      const pdfBuffer = await page.pdf({ preferCSSPageSize: true });
      writeFileSync(path.join(ARTIFACTS_DIR, `${name}.pdf`), pdfBuffer);

      const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });

      // The PDF text layer is real (selectable) text; the resolved counter
      // values printed in the margin must match the contract exactly — no
      // missing anchors, no extras, no drift.
      const found = [...new Set(await pdfAnchors(pdf))];
      expect(found.sort()).toEqual(expected.map((e) => e.anchor).sort());

      // Folio from the @page margin box.
      expect(squash(text)).toContain(squash(`Page 1 of ${totalPages}`));
    } finally {
      await page.close();
    }
  });
});

describe("page geometry and fonts", () => {
  it("lays out a Letter sheet on screen with the exact @page text block", async () => {
    const page = await openFixture(representative);
    try {
      const geometry = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return {
          width: document.body.getBoundingClientRect().width,
          paddingTop: style.paddingTop,
          paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
        };
      });
      // 8.5in × 96dpi = 816px; margins 1.5in/2in/1.5in/1.5in = 144/192/144/144px.
      expect(geometry.width).toBe(816);
      expect(geometry.paddingTop).toBe("144px");
      expect(geometry.paddingRight).toBe("192px");
      expect(geometry.paddingBottom).toBe("144px");
      expect(geometry.paddingLeft).toBe("144px");
    } finally {
      await page.close();
    }
  });

  it("loads the embedded fonts (no OS-dependent fallbacks)", async () => {
    const page = await openFixture(representative);
    try {
      const fonts = await page.evaluate(() => ({
        serif: document.fonts.check('12pt "Source Serif 4"'),
        serifBold: document.fonts.check('bold 12pt "Source Serif 4"'),
        serifItalic: document.fonts.check('italic 12pt "Source Serif 4"'),
        mono: document.fonts.check('9.5pt "Source Code Pro"'),
      }));
      expect(fonts).toEqual({ serif: true, serifBold: true, serifItalic: true, mono: true });
    } finally {
      await page.close();
    }
  });
});

describe("multi-page behavior", () => {
  it("repeats the running header on pages after the first (long document)", async () => {
    const page = await openFixture(FIXTURES["long-document"]);
    try {
      const pdf = await getDocumentProxy(
        new Uint8Array(await page.pdf({ preferCSSPageSize: true })),
      );
      const { totalPages, text } = await extractText(pdf);
      expect(totalPages).toBeGreaterThan(3);
      const headerText = squash("A DELIBERATELY LONG DOCUMENT");
      // Suppressed on page 1 (the title is already there), present after.
      expect(squash(text[0])).not.toContain(headerText);
      for (let p = 1; p < totalPages; p++) {
        expect(squash(text[p])).toContain(headerText);
      }
    } finally {
      await page.close();
    }
  });

  it("repeats the table header row on every page of a long table", async () => {
    const page = await openFixture(FIXTURES["large-table"]);
    try {
      const pdf = await getDocumentProxy(
        new Uint8Array(await page.pdf({ preferCSSPageSize: true })),
      );
      const { totalPages, text } = await extractText(pdf);
      expect(totalPages).toBeGreaterThan(1);
      for (let p = 0; p < totalPages; p++) {
        // The closing paragraph's page may hold no table fragment.
        const body = squash(text[p]);
        if (body.includes("ingest-worker-")) {
          expect(body).toContain(squash("Last owner"));
        }
      }
    } finally {
      await page.close();
    }
  });

  it("keeps a short document to a single page", async () => {
    const page = await openFixture(noHeadings);
    try {
      const pdf = await getDocumentProxy(
        new Uint8Array(await page.pdf({ preferCSSPageSize: true })),
      );
      const { totalPages } = await extractText(pdf);
      expect(totalPages).toBe(1);
    } finally {
      await page.close();
    }
  });
});

describe("screen artifact", () => {
  it("captures the on-screen sheet rendering for visual QA", async () => {
    const page = await openFixture(representative);
    try {
      await page.setViewportSize({ width: 1000, height: 1200 });
      await page.screenshot({
        fullPage: true,
        path: path.join(ARTIFACTS_DIR, "representative-screen.png"),
      });
    } finally {
      await page.close();
    }
  });
});
