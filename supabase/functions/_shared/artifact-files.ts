// Binary assembly for the final artifacts: a real OOXML Word document
// (docx) and a real PowerPoint (pptxgenjs) — never flattened into images.
// Pure functions over validated specs; both verified to run under the Deno
// edge runtime (npm compatibility probed in _tests/artifact-files.test.ts).
//
// Visual identity (docs/research-workflow/06 §presentation visual identity):
// warm editorial — cream, charcoal, deep forest green, muted burnt orange.
// An original Hardcopy Tools style; no copied trade dress.

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "npm:docx@9.5.1";
// pptxgenjs ships CJS; under Deno's npm type resolution the default import
// is the module namespace, so construct through a cast.
import PptxGenJSModule from "npm:pptxgenjs@4.0.1";
import type { DocumentSpec, PresentationSpec } from "./artifacts.ts";

// deno-lint-ignore no-explicit-any
const PptxGenJS = PptxGenJSModule as unknown as new () => any;

// Editorial palette (hex, no #, as both libraries expect).
const CREAM = "F7F4EC";
const CHARCOAL = "2B2A26";
const FOREST = "2E4B3F";
const ORANGE = "B05A2C";

export async function buildDocx(spec: DocumentSpec): Promise<Uint8Array> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: spec.title, color: CHARCOAL })],
    }),
  ];

  for (const section of spec.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: section.heading, color: FOREST })],
      }),
    );
    for (const p of section.paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: p, color: CHARCOAL })],
        }),
      );
    }
    if (section.bullets) {
      for (const b of section.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: b, color: CHARCOAL })],
          }),
        );
      }
    }
    if (section.table) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: section.table.headers.map(
                (h) =>
                  new TableCell({
                    shading: { fill: FOREST },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })],
                      }),
                    ],
                  }),
              ),
            }),
            ...section.table.rows.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (cell) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: cell, color: CHARCOAL })],
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          ],
        }),
      );
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    }
  }

  if (spec.references.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: "References", color: FOREST })],
      }),
    );
    spec.references.forEach((r, i) => {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${i + 1}. ${r.title}. `, color: CHARCOAL }),
            new TextRun({ text: r.url, color: ORANGE }),
          ],
        }),
      );
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Georgia", size: 23 } }, // 11.5pt body serif
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], color: CHARCOAL, size: 18 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function buildPptx(spec: PresentationSpec): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  pptx.title = spec.title;

  // Title slide: cream field, forest rule, serif display.
  const title = pptx.addSlide();
  title.background = { color: CREAM };
  title.addShape("rect", { x: 0.7, y: 4.05, w: 3.2, h: 0.06, fill: { color: ORANGE } });
  title.addText(spec.title, {
    x: 0.7,
    y: 2.2,
    w: 11.9,
    h: 1.8,
    fontFace: "Georgia",
    fontSize: 40,
    color: FOREST,
    bold: true,
  });

  for (const slide of spec.slides) {
    const s = pptx.addSlide();
    s.background = { color: CREAM };
    s.addShape("rect", { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: FOREST } });
    s.addText(slide.title, {
      x: 0.7,
      y: 0.55,
      w: 11.9,
      h: 1.4,
      fontFace: "Georgia",
      fontSize: 30,
      color: CHARCOAL,
      bold: true,
    });
    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map((b) => ({
          text: b,
          options: { bullet: { characterCode: "2014", indent: 18 }, breakLine: true },
        })),
        {
          x: 0.9,
          y: 2.2,
          w: 11.3,
          h: 4.4,
          fontFace: "Helvetica",
          fontSize: 20,
          color: CHARCOAL,
          lineSpacing: 34,
          valign: "top",
        },
      );
    }
    if (slide.notes) s.addNotes(slide.notes);
  }

  const out = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new Uint8Array(out);
}
