/**
 * Checks on the bytes a save produced, before they overwrite anything.
 * PDFium reports failure by return code and still hands back a buffer.
 */

const PDF_HEADER = "%PDF-";
// A PDF cannot be meaningfully smaller than this; the smallest valid file is
// a few hundred bytes. Anything under it is a truncated or empty write.
const MIN_PDF_BYTES = 256;
// The spec puts %%EOF in the last 1024 bytes; allow slack for trailing padding.
const EOF_SCAN_BYTES = 4096;

function startsWith(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/** True when `%%EOF` appears within the last `EOF_SCAN_BYTES` bytes. */
function hasTrailingEof(bytes: Uint8Array): boolean {
  const marker = "%%EOF";
  const from = Math.max(0, bytes.length - EOF_SCAN_BYTES);
  for (let i = bytes.length - marker.length; i >= from; i--) {
    let match = true;
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/** Throw unless `bytes` look like a whole PDF: header, length, EOF marker. */
export function assertSavedPdf(bytes: Uint8Array): void {
  if (bytes.length < MIN_PDF_BYTES) {
    throw new Error(
      `Save produced ${bytes.length} bytes, which is too short to be a PDF; ` +
        "the file was left untouched.",
    );
  }
  if (!startsWith(bytes, PDF_HEADER)) {
    throw new Error(
      "Save produced data that does not start with a PDF header; " +
        "the file was left untouched.",
    );
  }
  if (!hasTrailingEof(bytes)) {
    throw new Error(
      "Save produced a PDF with no end-of-file marker, so it is truncated; " +
        "the file was left untouched.",
    );
  }
}

// Throw unless `saved` is `original` plus an appended revision: an incremental
// save may only ADD, or the bytes a signature covers have moved.
export function assertIncrementalAppend(
  saved: Uint8Array,
  original: Uint8Array,
): void {
  if (saved.length < original.length) {
    throw new Error(
      "Incremental save is shorter than the file it appends to, so the signed " +
        "revision was rewritten; the file was left untouched.",
    );
  }
  for (let i = 0; i < original.length; i++) {
    if (saved[i] !== original[i]) {
      throw new Error(
        `Incremental save changed byte ${i} of the original revision, so its ` +
          "signatures would no longer verify; the file was left untouched.",
      );
    }
  }
}
