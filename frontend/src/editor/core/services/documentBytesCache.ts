/**
 * One ArrayBuffer per document, shared by the viewer's scans (form fields,
 * signature/button appearances, measurement scales).
 *
 * Callers must not detach the returned buffer: pdf.js transfers whatever it is
 * given, so anything that hands bytes to pdf.js has to pass a URL instead.
 *
 * The buffer is held weakly: a File record pinned by unrelated state (stale
 * React fibers, sidebar metadata) must not keep the whole document resident.
 * Callers that need the bytes hold the buffer they were handed; once nothing
 * does, the next call re-reads the Blob.
 *
 * Files are also keyed by name/size/type/mtime: the add path re-wraps the same
 * bytes as fresh `File` objects, so identity alone would read every document
 * once per wrapper. Bare Blobs stay identity-keyed, since they carry no metadata.
 */
const resolved = new WeakMap<Blob, WeakRef<ArrayBuffer>>();
const pending = new WeakMap<Blob, Promise<ArrayBuffer>>();
const FILE_KEY_CACHE_LIMIT = 64;
const resolvedByFileKey = new Map<
  string,
  { ref: WeakRef<ArrayBuffer>; size: number }
>();
const pendingByFileKey = new Map<string, Promise<ArrayBuffer>>();

function fileKey(blob: Blob): string | null {
  if (!(blob instanceof File)) return null;
  return `${blob.name}\u0000${blob.size}\u0000${blob.type}\u0000${blob.lastModified}`;
}

function rememberFileKey(key: string, buffer: ArrayBuffer): void {
  resolvedByFileKey.delete(key);
  resolvedByFileKey.set(key, {
    ref: new WeakRef(buffer),
    size: buffer.byteLength,
  });
  while (resolvedByFileKey.size > FILE_KEY_CACHE_LIMIT) {
    const oldest = resolvedByFileKey.keys().next().value;
    if (oldest === undefined) break;
    resolvedByFileKey.delete(oldest);
  }
}

/** Drops the cached entry, e.g. for a large document whose worker copy is up. */
export function releaseDocumentBytes(blob: Blob): void {
  resolved.delete(blob);
  pending.delete(blob);
  const key = fileKey(blob);
  if (key) {
    resolvedByFileKey.delete(key);
    pendingByFileKey.delete(key);
  }
}

export function getDocumentBytes(blob: Blob): Promise<ArrayBuffer> {
  const alive = resolved.get(blob)?.deref();
  if (alive) return Promise.resolve(alive);

  const key = fileKey(blob);
  if (key) {
    const shared = resolvedByFileKey.get(key);
    if (shared && shared.size === blob.size) {
      const buffer = shared.ref.deref();
      if (buffer) return Promise.resolve(buffer);
      resolvedByFileKey.delete(key);
    }
    const inFlight = pendingByFileKey.get(key);
    if (inFlight) return inFlight;
  }

  const inFlight = pending.get(blob);
  if (inFlight) return inFlight;

  const reading = blob.arrayBuffer().then(
    (buffer) => {
      resolved.set(blob, new WeakRef(buffer));
      if (key) {
        rememberFileKey(key, buffer);
        pendingByFileKey.delete(key);
      }
      pending.delete(blob);
      return buffer;
    },
    (error: unknown) => {
      pending.delete(blob);
      if (key) pendingByFileKey.delete(key);
      throw error;
    },
  );
  pending.set(blob, reading);
  if (key) pendingByFileKey.set(key, reading);
  return reading;
}
