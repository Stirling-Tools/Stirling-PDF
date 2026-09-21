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
 * Files are also keyed by name/size/type/mtime plus a first/last-64 KB
 * fingerprint: the add path re-wraps the same bytes as fresh `File` objects, so
 * identity alone would read every document once per wrapper, and metadata alone
 * would let two different documents with identical metadata share one entry.
 * Bare Blobs stay identity-keyed, since they carry no metadata.
 */
const resolved = new WeakMap<Blob, WeakRef<ArrayBuffer>>();
const pending = new WeakMap<Blob, Promise<ArrayBuffer>>();
const FILE_KEY_CACHE_LIMIT = 64;
const resolvedByFileKey = new Map<
  string,
  { ref: WeakRef<ArrayBuffer>; size: number }
>();
const pendingByFileKey = new Map<string, Promise<ArrayBuffer>>();

const FINGERPRINT_WINDOW = 64 * 1024;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const fingerprints = new WeakMap<Blob, Promise<string>>();

function hashInto(hash: number, bytes: Uint8Array): number {
  let value = hash;
  for (let i = 0; i < bytes.length; i += 1) {
    value ^= bytes[i];
    value = Math.imul(value, FNV_PRIME) >>> 0;
  }
  return value;
}

/**
 * Cheap content fingerprint: the first and last 64 KB hashed with FNV-1a (the
 * whole blob when it is smaller). Two small slice reads per Blob, cached by
 * identity, are what let the shared caches key by content rather than trusting
 * metadata alone.
 */
export function documentFingerprint(blob: Blob): Promise<string> {
  const cached = fingerprints.get(blob);
  if (cached) return cached;
  const promise = (async () => {
    let hash = FNV_OFFSET;
    hash = hashInto(
      hash,
      new Uint8Array(await blob.slice(0, FINGERPRINT_WINDOW).arrayBuffer()),
    );
    if (blob.size > FINGERPRINT_WINDOW) {
      hash = hashInto(
        hash,
        new Uint8Array(
          await blob
            .slice(Math.max(0, blob.size - FINGERPRINT_WINDOW), blob.size)
            .arrayBuffer(),
        ),
      );
    }
    return hash.toString(16).padStart(8, "0");
  })();
  fingerprints.set(blob, promise);
  return promise;
}

/**
 * Identity of a File's content for cross-wrapper lookups: name, size, type,
 * mtime and the fingerprint above. Bare Blobs carry no metadata and return
 * null.
 */
export async function documentFileKey(blob: Blob): Promise<string | null> {
  if (!(blob instanceof File)) return null;
  const fingerprint = await documentFingerprint(blob);
  return `${blob.name}\u0000${blob.size}\u0000${blob.type}\u0000${blob.lastModified}\u0000${fingerprint}`;
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
export async function releaseDocumentBytes(blob: Blob): Promise<void> {
  resolved.delete(blob);
  pending.delete(blob);
  const key = await documentFileKey(blob);
  if (key) {
    resolvedByFileKey.delete(key);
    pendingByFileKey.delete(key);
  }
}

export async function getDocumentBytes(blob: Blob): Promise<ArrayBuffer> {
  const alive = resolved.get(blob)?.deref();
  if (alive) return alive;

  const key = await documentFileKey(blob);
  if (key) {
    const shared = resolvedByFileKey.get(key);
    if (shared && shared.size === blob.size) {
      const buffer = shared.ref.deref();
      if (buffer) return buffer;
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
