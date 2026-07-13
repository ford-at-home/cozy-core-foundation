// Structural validation for OOXML binaries (docx/pptx) before a
// final_artifacts row may be marked 'ready'. A corrupt or truncated file
// must fail the artifact (retryable) — a user downloading a "ready"
// document that Word cannot open is the worst possible outcome of the
// final step.
//
// Pure module: reads the ZIP central directory only (filenames and
// uncompressed sizes are stored uncompressed there), so no inflate
// dependency is needed. Tested by _tests/ooxml.test.ts.

const LOCAL_FILE_SIG = 0x04034b50; // "PK\x03\x04"
const CENTRAL_DIR_SIG = 0x02014b50; // "PK\x01\x02"
const EOCD_SIG = 0x06054b50; // "PK\x05\x06"
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

// A real word/document.xml or ppt/presentation.xml from any OOXML library
// is well over this; anything smaller is a stub or truncation.
const MIN_MAIN_PART_BYTES = 200;

export type OoxmlKind = "docx" | "pptx";

export interface OoxmlValidation {
  ok: boolean;
  reason?: string;
}

interface ZipEntry {
  name: string;
  uncompressedSize: number;
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
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) return null;
    entries.push({
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      uncompressedSize,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Validate that the bytes are a structurally plausible OOXML package:
 * ZIP magic, a readable central directory, `[Content_Types].xml`, and a
 * non-trivial main document part for the kind.
 */
export function validateOoxmlArtifact(bytes: Uint8Array, kind: OoxmlKind): OoxmlValidation {
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
  return { ok: true };
}
