/**
 * The local @embedpdf patch streams Blobs in the worker, but the package types
 * still say ArrayBuffer (see frontend/README.md, "Local @embedpdf patches").
 * Validating the value here keeps a wrong source from failing inside the worker.
 */
export function toEngineDocumentBuffer(source: unknown): ArrayBuffer {
  if (source instanceof ArrayBuffer || source instanceof Blob) {
    return source as unknown as ArrayBuffer;
  }
  throw new TypeError("engine document source must be an ArrayBuffer or Blob");
}
