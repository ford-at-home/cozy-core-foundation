// Structural OOXML validation (P0.8): a corrupt or truncated docx/pptx must
// never let a final_artifacts row go 'ready'. Fixtures are hand-built stored
// (uncompressed) ZIP archives — the validator reads only the central
// directory, which is identical for stored and deflated entries.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { listZipEntries, validateOoxmlArtifact } from "../_shared/ooxml.ts";

// ---------------------------------------------------------------- fixture
// Minimal stored-entry ZIP builder: local file headers + central directory +
// EOCD, correct offsets and sizes. CRCs are zeroed — the validator never
// inflates content, exactly like a truncation would leave them wrong anyway.
function makeZip(entries: Array<{ name: string; size: number }>): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const local = new Uint8Array(30 + name.length + e.size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint32(18, e.size, true); // compressed size (stored)
    lv.setUint32(22, e.size, true); // uncompressed size
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    // content bytes stay zeroed
    chunks.push(local);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint32(20, e.size, true); // compressed size
    cv.setUint32(24, e.size, true); // uncompressed size
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

const VALID_DOCX_ENTRIES = [
  { name: "[Content_Types].xml", size: 1200 },
  { name: "_rels/.rels", size: 500 },
  { name: "word/document.xml", size: 4000 },
];

Deno.test("ooxml: a structurally complete docx passes", () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  assertEquals(validateOoxmlArtifact(zip, "docx"), { ok: true });
});

Deno.test("ooxml: a structurally complete pptx passes", () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "ppt/presentation.xml", size: 2500 },
  ]);
  assertEquals(validateOoxmlArtifact(zip, "pptx"), { ok: true });
});

Deno.test("ooxml: non-ZIP bytes are rejected (bad magic)", () => {
  const notZip = new TextEncoder().encode(
    "<html>Sorry, an error occurred generating your document.</html>" + "x".repeat(100),
  );
  const v = validateOoxmlArtifact(notZip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("ZIP"));
});

Deno.test("ooxml: tiny/empty payloads are rejected", () => {
  assert(!validateOoxmlArtifact(new Uint8Array(0), "docx").ok);
  assert(!validateOoxmlArtifact(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "docx").ok);
});

Deno.test("ooxml: a truncated archive (EOCD cut off) is rejected", () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  const truncated = zip.subarray(0, zip.length - 30);
  assert(!validateOoxmlArtifact(truncated, "docx").ok);
});

Deno.test("ooxml: missing [Content_Types].xml is rejected", () => {
  const zip = makeZip([
    { name: "word/document.xml", size: 4000 },
    { name: "_rels/.rels", size: 500 },
  ]);
  const v = validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("[Content_Types].xml"));
});

Deno.test("ooxml: missing main document part is rejected", () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/styles.xml", size: 3000 },
  ]);
  const v = validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("word/document.xml"));
});

Deno.test("ooxml: a trivial (near-empty) main part is rejected", () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", size: 1200 },
    { name: "word/document.xml", size: 50 },
  ]);
  const v = validateOoxmlArtifact(zip, "docx");
  assert(!v.ok);
  assert(v.reason?.includes("truncated or empty"));
});

Deno.test("ooxml: kind selects the required main part (docx zip is not a valid pptx)", () => {
  const zip = makeZip(VALID_DOCX_ENTRIES);
  const v = validateOoxmlArtifact(zip, "pptx");
  assert(!v.ok);
  assert(v.reason?.includes("ppt/presentation.xml"));
});

Deno.test("ooxml: listZipEntries reports names and uncompressed sizes", () => {
  const entries = listZipEntries(makeZip(VALID_DOCX_ENTRIES));
  assert(entries);
  assertEquals(entries.length, 3);
  assertEquals(entries[2], { name: "word/document.xml", uncompressedSize: 4000 });
});
