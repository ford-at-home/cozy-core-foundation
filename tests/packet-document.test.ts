import { describe, expect, it } from "vitest";
import { buildPacketPrintDocument, type PacketPrintQuestion } from "@/lib/print-document";

const BODY = [
  "# Automation and Administrative Work",
  "",
  "## The research question",
  "",
  "How has automated document review changed entry-level administrative employment?",
  "",
  "## Major findings",
  "",
  "Employment declined in three occupations ([BLS](https://example.com/bls)).",
].join("\n");

const QUESTIONS: PacketPrintQuestion[] = [
  {
    position: 1,
    function: "prior_belief",
    claim_ref: "C1",
    prompt:
      "Before reading the BLS evidence, what did you believe about automation and office work, and which experience shaped that belief?",
    guidance: null,
    response_space: "lines_3",
  },
  {
    position: 2,
    function: "evidence_integrity",
    claim_ref: "E2",
    prompt:
      "The employment conclusion depends on the 2019-2024 BLS occupational series. Which two features of that data should be checked, and how could each distort the conclusion?",
    guidance: "Consider classification changes and contract work.",
    response_space: "half_page",
  },
  {
    position: 3,
    function: "ground_truth",
    claim_ref: "L1",
    prompt:
      'Identify one person in your community with direct knowledge of hiring changes & write the first three questions you would ask them — including one with <angle brackets> and "quotes".',
    guidance: null,
    response_space: "box",
  },
  {
    position: 4,
    function: "followup",
    claim_ref: "U1",
    prompt:
      "The packet establishes the decline but leaves uncertainty about cause. Write up to three follow-up research questions you want answered with authoritative evidence.",
    guidance: "What source, dataset, or expert would make the answer credible?",
    response_space: "lines_5",
  },
];

const OPTS = { packetId: "0a1b2c3d-ffff-4444-aaaa-999999999999", version: 1 };

describe("buildPacketPrintDocument", () => {
  const doc = buildPacketPrintDocument(BODY, QUESTIONS, OPTS);

  it("is a self-contained document with anchors enabled and Letter geometry", () => {
    expect(doc).toContain('<body class="with-anchors">');
    expect(doc).toContain("size: letter");
    expect(doc).toContain("margin: 1.5in 2in 1.5in 0.5in");
    expect(doc.match(/data:font\/woff2;base64,/g)).toHaveLength(5);
  });

  it("prints the packet header with a short id and student fields", () => {
    expect(doc).toContain("Research packet 0a1b2c3d · v1");
    expect(doc).toContain('<span class="packet-field-label">Name</span>');
    expect(doc).toContain('<span class="packet-field-label">Course</span>');
    expect(doc).toContain('<span class="packet-field-label">Date</span>');
  });

  it("omits the version stamp when the packet row was unreadable (version: null)", () => {
    const degraded = buildPacketPrintDocument(BODY, [], { ...OPTS, version: null });
    expect(degraded).toContain("Research packet 0a1b2c3d</div>");
    expect(degraded).not.toContain("· v");
  });

  it("keeps the existing markup legend and adds the handwriting guidance", () => {
    expect(doc).toContain("Markup key");
    expect(doc).toContain("Writing your answers");
    // The dictation alternative is always offered, verbatim.
    expect(doc).toContain("you may dictate your answers and reference the page number");
  });

  it("renders regular questions with ids, claim refs, and writing space", () => {
    expect(doc).toContain('<span class="pq-id">Q1</span>');
    expect(doc).toContain('<span class="pq-id">Q2</span>');
    expect(doc).toContain('<span class="pq-id">Q3</span>');
    expect(doc).toContain("refers to C1");
    expect(doc).toContain("refers to E2");
    expect(doc).toContain("Questions for your written response");
  });

  it("sizes ruled lines by response_space (3 / 11 lines, one box)", () => {
    const q1 = doc.slice(doc.indexOf(">Q1<"), doc.indexOf(">Q2<"));
    expect(q1.match(/class="response-line"/g)).toHaveLength(3);
    const q2 = doc.slice(doc.indexOf(">Q2<"), doc.indexOf(">Q3<"));
    expect(q2.match(/class="response-line"/g)).toHaveLength(11);
    const q3 = doc.slice(doc.indexOf(">Q3<"), doc.indexOf("Further research"));
    expect(q3.match(/class="response-box"/g)).toHaveLength(1);
  });

  it("renders the follow-up section as three areas with credibility sub-prompts", () => {
    const section = doc.slice(doc.indexOf("Further research"));
    expect(section).toContain(">Q4.1<");
    expect(section).toContain(">Q4.2<");
    expect(section).toContain(">Q4.3<");
    expect(
      section.match(/What source, dataset, or expert would make the answer credible\?/g),
    ).toHaveLength(3);
  });

  it("includes return instructions with the photo and dictation paths", () => {
    expect(doc).toContain("Returning this packet");
    expect(doc).toContain("photograph each completed page");
    expect(doc).toContain("Or dictate your answers");
  });

  it("escapes question text (user content) for HTML", () => {
    expect(doc).toContain("&lt;angle brackets&gt;");
    expect(doc).toContain("&quot;quotes&quot;");
    expect(doc).not.toContain("<angle brackets>");
  });

  it("builds ALL packet furniture from divs/spans — zero p/heading tags outside the body", () => {
    // The packet body ends before the questions section; everything after it
    // must not introduce anchor-countable elements (p, h1-h6, blockquote,
    // pre, table) or the S{n}P{m} contract would shift.
    const furniture = doc.slice(doc.indexOf("Questions for your written response"));
    expect(furniture).not.toMatch(/<(p|h[1-6]|blockquote|pre|table)[\s>]/);
    // The leading newline skips the same string quoted in print.css comments.
    const header = doc.slice(doc.indexOf('\n<body class="with-anchors">'), doc.indexOf("<h1"));
    expect(header).not.toMatch(/<(p|h[1-6]|blockquote|pre|table)[\s>]/);
  });

  it("renders the follow-up section even when no questions were persisted", () => {
    const empty = buildPacketPrintDocument(BODY, [], OPTS);
    expect(empty).not.toContain("Questions for your written response");
    expect(empty).toContain("Further research");
    expect(empty).toContain(">F.1<");
    expect(empty).toContain(
      "What source, dataset, expert, institution, or type of evidence would make the answer credible?",
    );
  });

  it("is deterministic: same input, same document", () => {
    expect(buildPacketPrintDocument(BODY, QUESTIONS, OPTS)).toBe(doc);
  });
});
