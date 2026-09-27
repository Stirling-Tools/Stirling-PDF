/**
 * Read a slice of a Blob into a Uint8Array, streaming the slice where the
 * platform supports it and falling back to Blob.prototype.arrayBuffer.
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
