const ENCRYPT_PROBE_BYTES = 64 * 1024;

/** Binary decoding preserves bytes around the marker; the boundary excludes longer names. */
export function containsEncryptMarker(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(new TextDecoder("latin1").decode(bytes));
}

/**
 * Reads at most 64 KiB from each end for trailer hints, including linearized PDFs.
 * A missing marker does not prove a PDF unencrypted; opening must verify access with a parser.
 */
export async function looksEncryptedFromTrailer(file: Blob): Promise<boolean> {
  const tailStart = Math.max(0, file.size - ENCRYPT_PROBE_BYTES);
  const tail = await file.slice(tailStart).arrayBuffer();
  if (containsEncryptMarker(new Uint8Array(tail))) return true;
  if (tailStart === 0) return false;
  const head = await file.slice(0, ENCRYPT_PROBE_BYTES).arrayBuffer();
  return containsEncryptMarker(new Uint8Array(head));
}
