// Structural OOXML validation (P0.8): a corrupt or truncated docx/pptx must
// never let a final_artifacts row go 'ready'. Fixtures are hand-built stored
// (uncompressed) ZIP archives; content checks read the stored bytes exactly
// like the validator inflates deflated ones.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { listZipEntries, readZipEntryText, validateOoxmlArtifact } from "../_shared/ooxml.ts";

// ---------------------------------------------------------------- fixture
// Minimal ZIP builder: local file headers + central directory + EOCD,
// correct offsets and sizes. Entries are stored (method 0) with the given
// content — or zero-filled to `size` — unless a bogus `method` is forced.
// CRCs are zeroed; the validator never checks them.
interface FixtureEntry {
  name: string;
  size?: number;
  content?: string;
  method?: number;
}

function makeZip(entries: FixtureEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.content !== undefined ? enc.encode(e.content) : new Uint8Array(e.size ?? 0);
    const method = e.method ?? 0;

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(8, method, true); // compression method
    lv.setUint32(18, data.length, true); // compressed size (stored)
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    chunks.push(local);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(10, method, true); // compression method
    cv.setUint32(20, data.length, true); // compressed size
    cv.setUint32(24, data.length, true); // uncompressed size
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // local header offset
    cd.set(name, 46);
    central.push(cd);

    offset += local.length;
  }

  const cdirOffset = offset;
  let cdirSize = 0;
  for (const c of central) cdirSize += c.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, cdirSize, true);
  ev.setUint32(16, cdirOffset, true);

  const total = offset + cdirSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, eocd]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const DOCUMENT_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body><w:p><w:r><w:t>Findings from the research packet.</w:t></w:r></w:p></w:body>` +
  `</w:document>`;

const VALID_DOCX_ENTRIES: FixtureEntry[] = [
  { name: "[Content_Types].xml", size: 1200 },
  { name: "_rels/.rels", size: 500 },
  { name: "word/styles.xml", size: 3000 },
  { name: "word/document.xml", content: DOCUMENT_XML },
];

const VALID_PPTX_ENTRIES: FixtureEntry[] = [
  { name: "[Content_Types].xml", size: 1200 },
  { name: "ppt/presentation.xml", size: 2500 },
  { name: "ppt/slides/slide1.xml", size: 900 },
  { name: "ppt/slides/slide2.xml", size: 900 },
  { name: "ppt/slides/slide3.xml", size: 900 },
];

Deno.test("ooxml: a structurally complete docx passes", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  assertEquals(await validateOoxmlArtifact(zip, "docx"), { ok: true });
});

Deno.test("ooxml: a structurally complete pptx passes", async () => {
  const zip = makeZip(VALID_PPTX_ENTRIES);
  assertEquals(await validateOoxmlArtifact(zip, "pptx"), { ok: true });
});

Deno.test("ooxml: non-ZIP bytes are rejected (bad magic)", async () => {
  const notZip = new TextEncoder().encode(
    "<html>Sorry, an error occurred generating your document.</html>" + "x".repeat(100),
  );
  const v = await validateOoxmlArtifact(notZip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("ZIP"));
});

Deno.test("ooxml: tiny/empty payloads are rejected", async () => {
  assert(!(await validateOoxmlArtifact(new Uint8Array(0), "docx")).ok);
  assert(!(await validateOoxmlArtifact(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "docx")).ok);
});

Deno.test("ooxml: a truncated archive (EOCD cut off) is rejected", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  const truncated = zip.subarray(0, zip.length - 30);
  assert(!(await validateOoxmlArtifact(truncated, "docx")).ok);
});

Deno.test("ooxml: missing [Content_Types].xml is rejected", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES.filter((e) => e.name !== "[Content_Types].xml"));
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("[Content_Types].xml"));
});

Deno.test("ooxml: missing main document part is rejected", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES.filter((e) => e.name !== "word/document.xml"));
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("word/document.xml"));
});

Deno.test("ooxml: a trivial (near-empty) main part is rejected", async () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/styles.xml", size: 3000 },
    { name: "word/document.xml", content: "<w:document/>" },
  ]);
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("truncated or empty"));
});

Deno.test("ooxml: a docx without word/styles.xml is rejected", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES.filter((e) => e.name !== "word/styles.xml"));
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("word/styles.xml"));
});

Deno.test("ooxml: a docx whose body has no paragraphs is rejected", async () => {
  const emptyBody =
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body></w:body></w:document>` +
    "<!-- padding to clear the size floor -->".repeat(5);
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/styles.xml", size: 3000 },
    { name: "word/document.xml", content: emptyBody },
  ]);
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("no document body paragraphs"));
});

Deno.test("ooxml: a docx main part with a corrupt deflate stream is rejected", async () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/styles.xml", size: 3000 },
    // Method 8 (deflate) over garbage bytes: inflate must fail.
    { name: "word/document.xml", content: "not actually deflated ".repeat(20), method: 8 },
  ]);
  const v = await validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("unreadable"));
});

Deno.test("ooxml: an exotic compression method skips content checks but still passes structure", async () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/styles.xml", size: 3000 },
    // Method 99 (unknown to the validator): structure-only validation.
    { name: "word/document.xml", size: 4000, method: 99 },
  ]);
  assertEquals(await validateOoxmlArtifact(zip, "docx"), { ok: true });
});

Deno.test("ooxml: a pptx with fewer than 3 slide parts is rejected", async () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "ppt/presentation.xml", size: 2500 },
    { name: "ppt/slides/slide1.xml", size: 900 },
  ]);
  const v = await validateOoxmlArtifact(zip, "pptx");
  assert(!v.ok);
  assert(v.reason?.includes("slide part"));
});

Deno.test("ooxml: kind selects the required main part (docx zip is not a valid pptx)", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  const v = await validateOoxmlArtifact(zip, "pptx");
  assert(!v.ok);
  assert(v.reason?.includes("ppt/presentation.xml"));
});

Deno.test("ooxml: listZipEntries reports names, sizes, methods, and offsets", () => {
  const entries = listZipEntries(makeZip(VALID_DOCX_ENTRIES));
  assert(entries);
  assertEquals(entries.length, 4);
  const doc = entries.find((e) => e.name === "word/document.xml");
  assert(doc);
  assertEquals(doc.uncompressedSize, DOCUMENT_XML.length);
  assertEquals(doc.compressionMethod, 0);
});

Deno.test("ooxml: readZipEntryText reads a stored entry verbatim", async () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  const entries = listZipEntries(zip);
  assert(entries);
  const doc = entries.find((e) => e.name === "word/document.xml");
  assert(doc);
  assertEquals(await readZipEntryText(zip, doc), DOCUMENT_XML);
});
