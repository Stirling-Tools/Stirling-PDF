import { readBlobSlice } from "@editor/utils/blobSlice";

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
  if (containsEncryptMarker(await readBlobSlice(file, tailStart))) return true;
  if (tailStart === 0) return false;
  return containsEncryptMarker(
    await readBlobSlice(file, 0, ENCRYPT_PROBE_BYTES),
  );
}
