const HEADER_PREFIX = "%PDF-";
// ISO 32000-2, 7.5.2: readers accept the header anywhere in the first 1024 bytes.
const HEADER_SEARCH_LIMIT = 1024;

interface PdfHeaderVersion {
  version: string;
  offset: number;
}

function isVersionByte(byte: number): boolean {
  return (byte >= 0x30 && byte <= 0x39) || byte === 0x2e;
}

function findHeader(bytes: Uint8Array): PdfHeaderVersion | null {
  const limit = Math.min(bytes.length, HEADER_SEARCH_LIMIT);
  for (let i = 0; i + HEADER_PREFIX.length <= limit; i++) {
    let match = true;
    for (let j = 0; j < HEADER_PREFIX.length; j++) {
      if (bytes[i + j] !== HEADER_PREFIX.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const offset = i + HEADER_PREFIX.length;
    let end = offset;
    while (end < bytes.length && isVersionByte(bytes[end])) end++;
    const version = String.fromCharCode(...bytes.subarray(offset, end));
    return /^\d+\.\d+$/.test(version) ? { version, offset } : null;
  }
  return null;
}

/** The "x.y" version from a PDF header, or null when there is no valid header. */
export function readPdfHeaderVersion(bytes: Uint8Array): string | null {
  return findHeader(bytes)?.version ?? null;
}

/** Turns a PDFium file version (17, 20) into a header version ("1.7", "2.0"). */
export function pdfiumFileVersionToHeader(fileVersion: number): string {
  return `${Math.floor(fileVersion / 10)}.${fileVersion % 10}`;
}

function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}

/** The highest of the given versions, or null when none is known. */
export function highestPdfVersion(
  versions: Iterable<string | null>,
): string | null {
  let highest: string | null = null;
  for (const version of versions) {
    if (version && (!highest || compareVersions(version, highest) > 0)) {
      highest = version;
    }
  }
  return highest;
}

/**
 * PDFium writes `%PDF-1.` + (version % 10), so a 2.0 source comes back as 1.0.
 * Raises the output header to the source version in place; same-length tokens only, so no offsets move.
 */
export function keepSourcePdfVersion<T extends ArrayBuffer | Uint8Array>(
  output: T,
  sourceVersion: string | null | undefined,
): T {
  if (!sourceVersion || !/^\d+\.\d+$/.test(sourceVersion)) return output;
  // isView, not instanceof: buffers from another realm (worker, jsdom) fail instanceof.
  const bytes = ArrayBuffer.isView(output)
    ? new Uint8Array(output.buffer, output.byteOffset, output.byteLength)
    : new Uint8Array(output);
  const header = findHeader(bytes);
  if (!header || header.version.length !== sourceVersion.length) return output;
  if (compareVersions(header.version, sourceVersion) >= 0) return output;
  for (let i = 0; i < sourceVersion.length; i++) {
    bytes[header.offset + i] = sourceVersion.charCodeAt(i);
  }
  return output;
}
