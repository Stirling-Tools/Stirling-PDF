/**
 * One ArrayBuffer per Blob, shared by the viewer's document scans (form
 * fields, signature/button appearances, measurement scales).
 *
 * Callers must not detach the returned buffer: pdf.js transfers whatever it
 * is given, so anything that needs to hand bytes to pdf.js must pass a URL
 * instead. Entries live as long as their Blob; there is nothing to revoke.
 *
 * Files are additionally keyed by name/size/type/mtime plus a first/last-64 KB
 * fingerprint: the add path re-wraps the same bytes as fresh `File` objects
 * (see `createStirlingFile`), so identity alone would read every document once
 * per wrapper, and metadata alone would let two different documents with
 * identical metadata share one entry. Bare Blobs stay identity-keyed, since
 * they carry no metadata.
 */
const cache = new WeakMap<Blob, Promise<ArrayBuffer>>();
const FILE_KEY_CACHE_LIMIT = 64;
const cacheByFileKey = new Map<string, Promise<ArrayBuffer>>();

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

function rememberFileKey(key: string, reading: Promise<ArrayBuffer>): void {
  cacheByFileKey.delete(key);
  cacheByFileKey.set(key, reading);
  reading.catch(() => {
    if (cacheByFileKey.get(key) === reading) cacheByFileKey.delete(key);
  });
  while (cacheByFileKey.size > FILE_KEY_CACHE_LIMIT) {
    const oldest = cacheByFileKey.keys().next().value;
    if (oldest === undefined) break;
    cacheByFileKey.delete(oldest);
  }
}

export async function getDocumentBytes(blob: Blob): Promise<ArrayBuffer> {
  const cached = cache.get(blob);
  if (cached) return cached;

  const key = await documentFileKey(blob);
  if (key) {
    const shared = cacheByFileKey.get(key);
    if (shared) return shared;
  }

  const pending = blob.arrayBuffer().catch((error: unknown) => {
    cache.delete(blob);
    throw error;
  });
  cache.set(blob, pending);
  if (key) rememberFileKey(key, pending);
  return pending;
}
