import { isStoredBlob } from "@app/utils/storedBlob";

/**
 * Bytes `[start, end)` of `blob`, with `Blob.slice` index semantics, read
 * without building a Blob over a stored one (see storedBlob). Reads from the
 * start always stream, because a Blob sent through postMessage loses its stored
 * mark. Chromium backs a stream with a pipe sized to the blob, not to `end`, so a
 * caller that reads many Blobs at once must run a few at a time. Aborting `signal`
 * cancels the stream, which is what releases that pipe, and rejects.
 */
export async function readBlobSlice(
  blob: Blob,
  start: number,
  end?: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  const from = clampIndex(start, blob.size);
  const to = end === undefined ? blob.size : clampIndex(end, blob.size);
  if (to <= from) return new Uint8Array(0);
  if (typeof blob.stream !== "function" || (from > 0 && !isStoredBlob(blob))) {
    return new Uint8Array(await blob.slice(from, to).arrayBuffer());
  }
  return readStreamRange(blob.stream(), from, to, signal);
}

function clampIndex(index: number, size: number): number {
  return index < 0 ? Math.max(size + index, 0) : Math.min(index, size);
}

/** `[from, to)` off the stream, dropping what comes before `from`. */
async function readStreamRange(
  stream: ReadableStream<Uint8Array>,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(to - from);
  const reader = stream.getReader();
  // Cancelling settles a pending read as done, so the loop below then throws.
  const cancel = () => reader.cancel().catch(() => undefined);
  signal?.addEventListener("abort", cancel, { once: true });
  let position = 0;
  let filled = 0;
  try {
    while (filled < bytes.length) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      const chunkEnd = position + value.length;
      if (chunkEnd > from) {
        const begin = Math.max(from - position, 0);
        const stop = Math.min(to - position, value.length);
        bytes.set(value.subarray(begin, stop), filled);
        filled += stop - begin;
      }
      position = chunkEnd;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.cancel().catch(() => undefined);
  }
  return filled === bytes.length ? bytes : bytes.slice(0, filled);
}
