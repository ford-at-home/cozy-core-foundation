// Structural verification of the final DOCX/PPTX design system.
//
// tests/office-samples.ts implements the mandatory design rules from
// buildFinalDocxPrompt / buildFinalPptxPrompt with the same libraries the
// prompts name; this suite generates both samples and asserts, on the real
// OOXML bytes, that the prompts' structural requirements are satisfiable and
// that the server-side validator (supabase/functions/_shared/ooxml.ts)
// accepts a well-formed artifact. The generated files are kept in
// test-artifacts/office/ for visual QA (open in Word/PowerPoint or render
// via LibreOffice).
//
// These are the AGGRESSIVE quality checks that deliberately do NOT live in
// the server gate: a legitimate agent artifact must never fail upload on a
// stylistic judgment, but our own reference implementation must hold the
// full bar.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  listZipEntries,
  readZipEntryText,
  validateOoxmlArtifact,
  type ZipEntry,
} from "../supabase/functions/_shared/ooxml.ts";
import { generateSampleDocx, generateSamplePptx } from "./office-samples";
import { samplePiece } from "./fixtures/office/sample-piece";

const ARTIFACTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-artifacts/office",
);

let docx: Uint8Array;
let pptx: Uint8Array;
let docxEntries: ZipEntry[];
let pptxEntries: ZipEntry[];

async function partText(bytes: Uint8Array, entries: ZipEntry[], name: string): Promise<string> {
  const entry = entries.find((e) => e.name === name);
  expect(entry, `missing OOXML part ${name}`).toBeDefined();
  const text = await readZipEntryText(bytes, entry!);
  expect(text, `unreadable OOXML part ${name}`).not.toBeNull();
  return text!;
}

/** Visible text of an OOXML part: element text content, entities decoded. */
function visibleText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

beforeAll(async () => {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  docx = await generateSampleDocx();
  pptx = await generateSamplePptx();
  writeFileSync(path.join(ARTIFACTS_DIR, "sample.docx"), docx);
  writeFileSync(path.join(ARTIFACTS_DIR, "sample.pptx"), pptx);
  docxEntries = listZipEntries(docx)!;
  pptxEntries = listZipEntries(pptx)!;
});

describe("final document sample (DOCX)", () => {
  it("passes the server-side structural gate", async () => {
    expect(await validateOoxmlArtifact(docx, "docx")).toEqual({ ok: true });
    // And kind-mismatch is caught: a docx is not a pptx.
    expect((await validateOoxmlArtifact(docx, "pptx")).ok).toBe(false);
  });

  it("carries document metadata (title + author)", async () => {
    const core = await partText(docx, docxEntries, "docProps/core.xml");
    expect(core).toContain(samplePiece.title);
    expect(core).toContain(samplePiece.studentName);
  });

  it("defines real Word heading styles and uses them (no faked headings)", async () => {
    const styles = await partText(docx, docxEntries, "word/styles.xml");
    expect(styles).toContain('w:styleId="Heading1"');
    expect(styles).toContain('w:styleId="Heading2"');

    const document = await partText(docx, docxEntries, "word/document.xml");
    expect(document).toContain('w:val="Heading1"');
    expect(document).toContain('w:val="Heading2"');
  });

  it("has every mandatory section in order", async () => {
    const text = visibleText(await partText(docx, docxEntries, "word/document.xml"));
    const sections = [
      samplePiece.title,
      "Executive summary",
      "Findings",
      "In the student's words",
      "Uncertainties and next steps",
      "Sources",
    ];
    let cursor = 0;
    for (const s of sections) {
      const at = text.indexOf(s, cursor);
      expect(at, `section "${s}" missing or out of order`).toBeGreaterThanOrEqual(0);
      cursor = at;
    }
  });

  it("keeps the student's verified words verbatim", async () => {
    const text = visibleText(await partText(docx, docxEntries, "word/document.xml"));
    for (const r of samplePiece.verifiedResponses) {
      expect(text).toContain(r.response);
    }
  });

  it("preserves every source URL as a real hyperlink relationship", async () => {
    const rels = await partText(docx, docxEntries, "word/_rels/document.xml.rels");
    for (const s of samplePiece.sources) {
      expect(rels).toContain(s.url);
    }
    const document = await partText(docx, docxEntries, "word/document.xml");
    expect(document).toContain("<w:hyperlink");
  });

  it("numbers pages via a real footer field", async () => {
    const footerParts = docxEntries.filter((e) => /^word\/footer\d+\.xml$/.test(e.name));
    expect(footerParts.length).toBeGreaterThan(0);
    const footers = await Promise.all(footerParts.map((e) => readZipEntryText(docx, e)));
    expect(footers.some((f) => f?.includes("PAGE"))).toBe(true);
  });

  it("marks the table header row (accessibility)", async () => {
    const document = await partText(docx, docxEntries, "word/document.xml");
    expect(document).toContain("<w:tbl>");
    expect(document).toContain("<w:tblHeader");
  });

  it("never uses blank paragraphs as spacing", async () => {
    const document = await partText(docx, docxEntries, "word/document.xml");
    // Two adjacent completely empty paragraphs are the canonical "spacing by
    // blank lines" tell. Empty <w:p/> pairs must not exist.
    expect(document).not.toMatch(/<w:p\/>\s*<w:p\/>/);
  });
});

describe("final presentation sample (PPTX)", () => {
  const slideXmls = () => pptxEntries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name));

  it("passes the server-side structural gate", async () => {
    expect(await validateOoxmlArtifact(pptx, "pptx")).toEqual({ ok: true });
    expect((await validateOoxmlArtifact(pptx, "docx")).ok).toBe(false);
  });

  it("carries deck metadata (title + author)", async () => {
    const core = await partText(pptx, pptxEntries, "docProps/core.xml");
    expect(core).toContain(samplePiece.title);
    expect(core).toContain(samplePiece.studentName);
  });

  it("has 8–12 slides (one idea per slide)", () => {
    expect(slideXmls().length).toBeGreaterThanOrEqual(8);
    expect(slideXmls().length).toBeLessThanOrEqual(12);
  });

  it("is 16:9 (13.33in × 7.5in)", async () => {
    const presentation = await partText(pptx, pptxEntries, "ppt/presentation.xml");
    expect(presentation).toContain('cx="12192000"');
    expect(presentation).toContain('cy="6858000"');
  });

  it("keeps every shape inside the slide bounds", async () => {
    const W = 12192000; // EMU
    const H = 6858000;
    for (const entry of slideXmls()) {
      const xml = await partText(pptx, pptxEntries, entry.name);
      const frames = [
        ...xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g),
      ];
      expect(frames.length, `${entry.name} has no positioned shapes`).toBeGreaterThan(0);
      for (const [, x, y, cx, cy] of frames) {
        expect(Number(x), `${entry.name}: shape off-slide left`).toBeGreaterThanOrEqual(0);
        expect(Number(y), `${entry.name}: shape off-slide top`).toBeGreaterThanOrEqual(0);
        expect(Number(x) + Number(cx), `${entry.name}: shape overflows right`).toBeLessThanOrEqual(
          W,
        );
        expect(Number(y) + Number(cy), `${entry.name}: shape overflows bottom`).toBeLessThanOrEqual(
          H,
        );
      }
    }
  });

  it("never sets type below 11pt", async () => {
    for (const entry of slideXmls()) {
      const xml = await partText(pptx, pptxEntries, entry.name);
      for (const [, sz] of xml.matchAll(/ sz="(\d+)"/g)) {
        // OOXML run sizes are in hundredths of a point.
        expect(Number(sz), `${entry.name} has a run below 11pt`).toBeGreaterThanOrEqual(1100);
      }
    }
  });

  it("puts speaker notes on every content slide", () => {
    const notes = pptxEntries.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e.name));
    // Every slide after the title slide carries notes.
    expect(notes.length).toBeGreaterThanOrEqual(slideXmls().length - 1);
  });

  it("shows every finding's source on its slide AND on the Sources slide", async () => {
    const texts = await Promise.all(
      slideXmls().map(async (e) => visibleText(await partText(pptx, pptxEntries, e.name))),
    );
    for (const f of samplePiece.findings) {
      const carriers = texts.filter((t) => t.includes(f.source.url));
      expect(
        carriers.length,
        `source ${f.source.url} must appear on ≥2 slides`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the student's verbatim words off the slides and in the notes", async () => {
    const slideText = (
      await Promise.all(
        slideXmls().map(async (e) => visibleText(await partText(pptx, pptxEntries, e.name))),
      )
    ).join(" ");
    const notesText = (
      await Promise.all(
        pptxEntries
          .filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e.name))
          .map(async (e) => visibleText(await partText(pptx, pptxEntries, e.name))),
      )
    ).join(" ");
    for (const r of samplePiece.verifiedResponses) {
      expect(slideText).not.toContain(r.response);
      expect(notesText).toContain(r.response);
    }
  });
});
