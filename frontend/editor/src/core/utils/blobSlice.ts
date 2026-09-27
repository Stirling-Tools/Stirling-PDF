/**
 * Read a slice of a Blob into a Uint8Array (streamed, arrayBuffer fallback).
 * Streaming only pays past ~64 KB (8 B: 0.007 ms vs 0.003; 64 KB: tied;
 * 1 MB: 0.056 vs 0.084; Node 22, directional). Current probes are all small,
 * so this buys one tested path, not speed.
 */
export async function readBlobSlice(
  blob: Blob,
  start: number,
  end?: number,
): Promise<Uint8Array> {
  const slice = end !== undefined ? blob.slice(start, end) : blob.slice(start);
  if (typeof slice.stream === "function") {
    const reader = slice.stream().getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLength += value.length;
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (chunks.length === 1) {
      return chunks[0];
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  return new Uint8Array(await slice.arrayBuffer());
}
