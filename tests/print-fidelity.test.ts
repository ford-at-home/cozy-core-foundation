import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { extractText, getDocumentProxy } from "unpdf";
import {
  buildPacketPrintDocument,
  buildPrintDocument,
  type PacketPrintQuestion,
} from "@/lib/print-document";
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
 * can jam an anchor against the neighboring prose. Only items painted in the
 * left margin column count — body prose may legitimately mention an anchor
 * (the markup legend's "WC– on S3P4" example) without being one. */
type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

// The @page left margin is 1.5in = 108pt; margin anchors end right-aligned
// just inside it, body text starts at or beyond it.
const LEFT_MARGIN_PT = 108;

async function pdfAnchors(pdf: PdfDocument): Promise<string[]> {
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = "str" in item ? item.str.trim() : "";
      const x = "transform" in item ? item.transform[4] : Number.POSITIVE_INFINITY;
      if (/^S\d+(?:P\d+)?$/.test(str) && x < LEFT_MARGIN_PT) out.push(str);
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

describe("research packet document", () => {
  // The packet adds question blocks with real writing space around the same
  // markdown body. The contract under test: packet furniture (header,
  // guidance, questions, response areas, follow-up section) consumes ZERO
  // S{n}P{m} anchors — the PDF's anchors must equal the body-only reference
  // walk — and the response areas paginate without being clipped.
  const PACKET_QUESTIONS: PacketPrintQuestion[] = [
    {
      position: 1,
      function: "prior_belief",
      claim_ref: "C1",
      prompt:
        "Before reading this evidence, what did you believe about the subject, and which experience most shaped that belief?",
      guidance: null,
      response_space: "lines_3",
    },
    {
      position: 2,
      function: "evidence_integrity",
      claim_ref: "E2",
      prompt:
        "The central conclusion depends on one dataset. Which two features of that dataset should be checked, and how could each distort the conclusion?",
      guidance: "Name the concrete checks, not categories.",
      response_space: "half_page",
    },
    {
      position: 3,
      function: "ground_truth",
      claim_ref: "L1",
      prompt:
        "Identify one person or organization in your community with direct knowledge of this topic and write the first three questions you would ask them.",
      guidance: null,
      response_space: "box",
    },
    {
      position: 4,
      function: "followup",
      claim_ref: "U1",
      prompt:
        "The packet establishes the main finding but leaves its cause uncertain. Write up to three follow-up research questions you want answered with authoritative evidence.",
      guidance: null,
      response_space: "lines_5",
    },
  ];
  const OPTS = { packetId: "fidelity-packet-0001", version: 1 };

  async function openPacket(source: string): Promise<Page> {
    const page = await browser.newPage();
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(buildPacketPrintDocument(source, PACKET_QUESTIONS, OPTS), {
      waitUntil: "load",
    });
    await page.evaluate(() => document.fonts.ready);
    return page;
  }

  it("packet furniture consumes zero anchors (PDF anchors = body-only walk)", async () => {
    const page = await openPacket(representative);
    try {
      const pdfBuffer = await page.pdf({ preferCSSPageSize: true });
      writeFileSync(path.join(ARTIFACTS_DIR, "packet-representative.pdf"), pdfBuffer);
      const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
      const found = [...new Set(await pdfAnchors(pdf))];
      const expected = expectedAnchors(representative);
      expect(found.sort()).toEqual(expected.map((e) => e.anchor).sort());
    } finally {
      await page.close();
    }
  });

  it("question ids, follow-up areas, and page furniture survive to the PDF", async () => {
    const page = await openPacket(representative);
    try {
      const pdf = await getDocumentProxy(
        new Uint8Array(await page.pdf({ preferCSSPageSize: true })),
      );
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const body = squash(text);
      for (const id of ["Q1", "Q2", "Q3", "Q4.1", "Q4.2", "Q4.3"]) {
        expect(body).toContain(squash(id));
      }
      expect(body).toContain(squash("Questions for your written response"));
      expect(body).toContain(squash("Further research"));
      expect(body).toContain(squash("Returning this packet"));
      // The header strip is uppercased by CSS; compare case-insensitively.
      expect(body.toUpperCase()).toContain(squash("Research packet fidelity").toUpperCase());
      expect(body).toContain(squash(`Page 1 of ${totalPages}`));
    } finally {
      await page.close();
    }
  });

  it("response areas paginate without splitting a question block", async () => {
    // Long body forces the questions section across page boundaries; every
    // question block must stay whole (its id and its writing area land on
    // one page) because print.css sets break-inside: avoid on the block.
    const page = await openPacket(longDocument(12));
    try {
      const pdf = await getDocumentProxy(
        new Uint8Array(await page.pdf({ preferCSSPageSize: true })),
      );
      const { totalPages, text } = await extractText(pdf);
      expect(totalPages).toBeGreaterThan(2);
      // The Q2 half-page block: its guidance line must be on the same page
      // as its question id (an intact block), never orphaned by a split.
      const q2Page = text.findIndex((p) => squash(p).includes("Q2"));
      expect(q2Page).toBeGreaterThanOrEqual(0);
      expect(squash(text[q2Page])).toContain(squash("Name the concrete checks"));
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
