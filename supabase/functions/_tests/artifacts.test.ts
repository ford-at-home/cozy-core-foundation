// Final artifacts contract tests (Phases 6–7): the student-contribution
// model, the synthesis prompts, strict spec validation (including the
// no-fabricated-citations filter), and the binary assemblers producing
// real OOXML under the Deno runtime.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MAX_SLIDES,
  MIN_SLIDES,
  buildDocumentPrompt,
  buildPresentationPrompt,
  buildVerifiedMaterial,
  parseDocumentSpec,
  parsePresentationSpec,
  type DocumentSpec,
} from "../_shared/artifacts.ts";
import { buildDocx, buildPptx } from "../_shared/artifact-files.ts";

// ----------------------------------------------------- verified material

const QUESTIONS = [
  { id: "q1", position: 1, prompt: "Did enrollment decline?" },
  { id: "q2", position: 2, prompt: "What did the audit find?" },
];

Deno.test("buildVerifiedMaterial groups answers by question, corrections win", () => {
  const material = buildVerifiedMaterial({
    questions: QUESTIONS,
    blocks: [
      {
        id: "b1",
        text: "misread handwriting",
        annotation_type: "response",
        location: null,
        linked_question_id: "q1",
        linked_anchor: null,
      },
      {
        id: "b2",
        text: "check the GAO source",
        annotation_type: "margin_note",
        location: "page 2",
        linked_question_id: null,
        linked_anchor: "S2P1",
      },
    ],
    segments: [
      { id: "s1", transcript: "Yes, it fell four percent", resolved_target: { question: 1 } },
      { id: "s2", transcript: "General thought about method", resolved_target: { page: 3 } },
    ],
    corrections: [{ block_id: "b1", segment_id: null, corrected_text: "the corrected answer" }],
  });

  assert(material.includes("QUESTION 1: Did enrollment decline?"));
  assert(
    material.includes("(written) the corrected answer"),
    "correction must replace the machine reading",
  );
  assert(!material.includes("misread handwriting"));
  assert(material.includes("(dictated) Yes, it fell four percent"));
  // Question 2 has no material — it must not appear.
  assert(!material.includes("QUESTION 2"));
  assert(material.includes("MARGIN NOTES AND MARKS:"));
  assert(material.includes("(margin_note, at S2P1) check the GAO source"));
  assert(material.includes("OTHER DICTATED MATERIAL:"));
  assert(material.includes("(dictated, page 3) General thought about method"));
});

Deno.test("buildVerifiedMaterial is empty when the student contributed nothing", () => {
  assertEquals(
    buildVerifiedMaterial({ questions: QUESTIONS, blocks: [], segments: [], corrections: [] }),
    "",
  );
});

// ------------------------------------------------------- document prompt

Deno.test("document prompt: student material reshapes, never appends; no fabrication", () => {
  const p = buildDocumentPrompt({
    topic: "Automation and employment",
    packetBody: "# Packet\nEvidence ([src](https://example.org/a))",
    verifiedMaterial: "QUESTION 1: …",
    followupReport: "## Second pass\nNew finding",
  });
  assert(p.includes("never be merely appended"));
  assert(p.includes("NEVER invent experiences"));
  assert(p.includes("no fabricated citations"));
  assert(p.includes("[Add your own view here:"));
  assert(p.includes("follow-up research (clearly marked as the second pass)"));
  assert(p.includes("New finding"));
  assert(p.includes("Evidence ([src](https://example.org/a))"));
});

Deno.test("document prompt without follow-up omits the second-pass section", () => {
  const p = buildDocumentPrompt({
    topic: "T",
    packetBody: "body",
    verifiedMaterial: "",
    followupReport: null,
  });
  assert(!p.includes("FOLLOW-UP RESEARCH FINDINGS"));
  assert(p.includes("(none — use clear academic style"));
});

// --------------------------------------------------------- document spec

const SOURCES = "The packet cites https://example.org/report and https://example.org/audit here.";

Deno.test("parseDocumentSpec keeps only citations present in the source material", () => {
  const { spec, droppedReferences } = parseDocumentSpec(
    JSON.stringify({
      title: "Final Paper",
      sections: [{ heading: "Intro", paragraphs: ["One."], bullets: null, table: null }],
      references: [
        { title: "Real report", url: "https://example.org/report" },
        { title: "Fabricated", url: "https://fabricated.example.com/nope" },
        { title: "No url" },
        { title: "Not http", url: "ftp://example.org/report" },
      ],
    }),
    SOURCES,
  );
  assertEquals(spec.references, [{ title: "Real report", url: "https://example.org/report" }]);
  assertEquals(droppedReferences, 3);
});

Deno.test("parseDocumentSpec strips markdown fences and validates tables", () => {
  const raw =
    "```json\n" +
    JSON.stringify({
      title: "T",
      sections: [
        {
          heading: "Comparison",
          paragraphs: [],
          bullets: ["a", "  ", 3],
          table: { headers: ["Year", "Rate"], rows: [["2023", "4%"], "not-a-row"] },
        },
        { heading: "", paragraphs: [], bullets: [], table: null },
      ],
      references: [],
    }) +
    "\n```";
  const { spec } = parseDocumentSpec(raw, SOURCES);
  assertEquals(spec.sections.length, 1, "empty section dropped");
  assertEquals(spec.sections[0].bullets, ["a"]);
  assertEquals(spec.sections[0].table, { headers: ["Year", "Rate"], rows: [["2023", "4%"]] });
});

Deno.test("parseDocumentSpec throws on structurally unusable documents", () => {
  assertThrows(() => parseDocumentSpec("not json", SOURCES));
  assertThrows(() => parseDocumentSpec(JSON.stringify({ sections: [] }), SOURCES));
  assertThrows(() => parseDocumentSpec(JSON.stringify({ title: "T", sections: [] }), SOURCES));
});

// ------------------------------------------------------ presentation spec

const PAPER: DocumentSpec = {
  title: "Final Paper",
  sections: [{ heading: "Intro", paragraphs: ["One."], bullets: null, table: null }],
  references: [],
};

Deno.test("presentation prompt: assertion titles, notes carry the prose, no new facts", () => {
  const p = buildPresentationPrompt(PAPER);
  assert(p.includes(`${MIN_SLIDES}–${MAX_SLIDES} slides`));
  assert(p.includes("SHORT ASSERTIONS"));
  assert(p.includes("Speaker notes carry the prose"));
  assert(p.includes("No new facts, no new sources"));
  assert(p.includes(JSON.stringify(PAPER)));
});

Deno.test("parsePresentationSpec validates, trims, caps bullets and slides", () => {
  const spec = parsePresentationSpec(
    JSON.stringify({
      title: "Talk",
      slides: [
        { title: "Claim one", bullets: ["a", "b", "c", "d", "e", "f"], notes: " spoken " },
        { title: "  ", bullets: [], notes: "" },
        ...Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, bullets: [], notes: "" })),
      ],
    }),
  );
  assertEquals(spec.title, "Talk");
  assert(spec.slides.length <= MAX_SLIDES);
  assertEquals(spec.slides[0].bullets.length, 5, "bullets capped");
  assertEquals(spec.slides[0].notes, "spoken");
  assert(!spec.slides.some((s) => !s.title.trim()), "untitled slides dropped");
});

Deno.test("parsePresentationSpec throws when there is nothing usable", () => {
  assertThrows(() => parsePresentationSpec(JSON.stringify({ title: "T", slides: [] })));
  assertThrows(() =>
    parsePresentationSpec(JSON.stringify({ title: "T", slides: [{ title: "" }] })),
  );
});

// ------------------------------------------------------- binary assembly
// PK\x03\x04 is the ZIP local-file-header magic — both OOXML formats are ZIPs.

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

Deno.test("buildDocx produces a real OOXML package under Deno", async () => {
  const bytes = await buildDocx({
    title: "Final Paper",
    sections: [
      {
        heading: "Findings",
        paragraphs: ["Enrollment fell."],
        bullets: ["four percent"],
        table: { headers: ["Year", "Rate"], rows: [["2023", "4%"]] },
      },
    ],
    references: [{ title: "Report", url: "https://example.org/report" }],
  });
  assert(bytes.byteLength > 1000, "docx should not be trivially small");
  assert(isZip(bytes), "docx must be a ZIP (OOXML) package");
});

Deno.test("buildPptx produces a real OOXML package under Deno", async () => {
  const bytes = await buildPptx({
    title: "Talk",
    slides: [
      { title: "Enrollment fell", bullets: ["four percent", "GAO audit"], notes: "Speak to this." },
      { title: "Method was flawed", bullets: [], notes: "" },
    ],
  });
  assert(bytes.byteLength > 1000, "pptx should not be trivially small");
  assert(isZip(bytes), "pptx must be a ZIP (OOXML) package");
});
