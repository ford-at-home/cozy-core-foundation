// Structural validation for OOXML binaries (docx/pptx) before a
// final_artifacts row may be marked 'ready'. A corrupt or truncated file
// must fail the artifact (retryable) — a user downloading a "ready"
// document that Word cannot open is the worst possible outcome of the
// final step.
//
// The checks are deliberately conservative: they reject files that any
// mainstream OOXML library could not have produced correctly (bad ZIP,
// missing required parts, empty document body, a deck with almost no
// slides), and nothing more. Document QUALITY rules (styles, headings,
// metadata, slide density) are enforced at prompt level and proven by the
// local sample suite (tests/office-artifacts.test.ts), not by this gate —
// a legitimate agent output must never fail here on a stylistic judgment.
//
// Pure module (no Deno APIs): the ZIP central directory is parsed by hand
// and entry contents are inflated with the standard DecompressionStream,
// so the same code runs in the Edge runtime and under vitest.
// Tested by _tests/ooxml.test.ts.

const LOCAL_FILE_SIG = 0x04034b50; // "PK\x03\x04"
const CENTRAL_DIR_SIG = 0x02014b50; // "PK\x01\x02"
const EOCD_SIG = 0x06054b50; // "PK\x05\x06"
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

// A real word/document.xml or ppt/presentation.xml from any OOXML library
// is well over this; anything smaller is a stub or truncation.
const MIN_MAIN_PART_BYTES = 200;

// The pptx prompt demands 8–12 slides; any real deck an agent produces has
// at least this many. Below it, the deck is a stub.
const MIN_SLIDE_COUNT = 3;

export type OoxmlKind = "docx" | "pptx";

export interface OoxmlValidation {
  ok: boolean;
  reason?: string;
}

export interface ZipEntry {
  name: string;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

/** Parse the ZIP central directory. Returns null when the bytes are not a ZIP. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] | null {
  if (bytes.length < EOCD_MIN_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== LOCAL_FILE_SIG) return null;

  // EOCD sits at the end, possibly followed by a comment (≤ 64 KB).
  let eocd = -1;
  const scanFloor = Math.max(0, bytes.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = view.getUint16(eocd + 10, true);
  const cdirOffset = view.getUint32(eocd + 16, true);
  if (cdirOffset >= bytes.length) return null;

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = cdirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_DIR_SIG) return null;
    const compressionMethod = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    if (p + 46 + nameLen > bytes.length) return null;
    entries.push({
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      uncompressedSize,
      compressedSize,
      compressionMethod,
      localHeaderOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read one entry's content as text. Returns null when the compression
 * method is one this validator doesn't speak (neither stored nor deflate) —
 * callers should skip content checks in that case rather than reject.
 * Throws when the entry is corrupt (bad local header or broken deflate
 * stream): that IS a structural failure.
 */
export async function readZipEntryText(bytes: Uint8Array, entry: ZipEntry): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localHeaderOffset;
  if (p + 30 > bytes.length || view.getUint32(p, true) !== LOCAL_FILE_SIG) {
    throw new Error(`bad local header for ${entry.name}`);
  }
  // Name/extra lengths come from the LOCAL header — they can differ from the
  // central directory's copies.
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const dataStart = p + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error(`truncated data for ${entry.name}`);
  const data = bytes.subarray(dataStart, dataEnd);

  if (entry.compressionMethod === 0) return new TextDecoder().decode(data);
  if (entry.compressionMethod === 8) return new TextDecoder().decode(await inflateRaw(data));
  return null;
}

/**
 * Validate that the bytes are a structurally plausible OOXML package:
 * ZIP magic, a readable central directory, `[Content_Types].xml`, a
 * non-trivial main document part that actually inflates, and — per kind —
 * a docx with a styles part and at least one paragraph, or a pptx with a
 * plausible number of slide parts.
 */
export async function validateOoxmlArtifact(
  bytes: Uint8Array,
  kind: OoxmlKind,
): Promise<OoxmlValidation> {
  const mainPart = kind === "docx" ? "word/document.xml" : "ppt/presentation.xml";
  const entries = listZipEntries(bytes);
  if (!entries) {
    return { ok: false, reason: "not a valid ZIP archive (bad magic bytes or central directory)" };
  }
  if (!entries.some((e) => e.name === "[Content_Types].xml")) {
    return { ok: false, reason: "missing [Content_Types].xml — not an OOXML package" };
  }
  const main = entries.find((e) => e.name === mainPart);
  if (!main) {
    return { ok: false, reason: `missing ${mainPart}` };
  }
  if (main.uncompressedSize < MIN_MAIN_PART_BYTES) {
    return {
      ok: false,
      reason: `${mainPart} is only ${main.uncompressedSize} bytes — truncated or empty document`,
    };
  }

  // The main part must actually decompress — a well-formed central directory
  // over a corrupt deflate stream is exactly what a bad byte-level transfer
  // produces.
  let mainXml: string | null;
  try {
    mainXml = await readZipEntryText(bytes, main);
  } catch (err) {
    return {
      ok: false,
      reason: `${mainPart} is unreadable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (kind === "docx") {
    if (!entries.some((e) => e.name === "word/styles.xml")) {
      return { ok: false, reason: "missing word/styles.xml — no style definitions" };
    }
    // Every real DOCX library emits w:-prefixed WordprocessingML; a body with
    // zero paragraphs is an empty document.
    if (mainXml !== null && !(mainXml.includes("<w:body") && mainXml.includes("<w:p"))) {
      return { ok: false, reason: "word/document.xml has no document body paragraphs" };
    }
  } else {
    const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name));
    if (slides.length < MIN_SLIDE_COUNT) {
      return {
        ok: false,
        reason: `presentation has only ${slides.length} slide part(s) — a real deck has at least ${MIN_SLIDE_COUNT}`,
      };
    }
  }

  return { ok: true };
}
