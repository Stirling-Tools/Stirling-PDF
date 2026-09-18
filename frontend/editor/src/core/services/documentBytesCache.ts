/**
 * One ArrayBuffer per Blob, shared by the viewer's document scans (form
 * fields, signature/button appearances, measurement scales).
 *
 * Callers must not detach the returned buffer: pdf.js transfers whatever it
 * is given, so anything that needs to hand bytes to pdf.js must pass a URL
 * instead. Entries live as long as their Blob; there is nothing to revoke.
 *
 * Files are additionally keyed by identity metadata (name/size/type/mtime):
 * the add path re-wraps the same bytes as fresh `File` objects (see
 * `createStirlingFile`), and without this tier the thumbnail, classification
 * and viewer reads each pulled their own full copy on real documents. A
 * signature match requires every field to agree; two genuinely different
 * files would have to share name, byte size, type and millisecond mtime to
 * collide, which is the same trade the URL cache accepts. Bare Blobs stay
 * identity-keyed: they carry no metadata and size alone collides.
 */
const cache = new WeakMap<Blob, Promise<ArrayBuffer>>();
const FILE_KEY_CACHE_LIMIT = 64;
const cacheByFileKey = new Map<string, Promise<ArrayBuffer>>();

function fileKey(blob: Blob): string | null {
  if (!(blob instanceof File)) return null;
  return `${blob.name}\u0000${blob.size}\u0000${blob.type}\u0000${blob.lastModified}`;
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

export function getDocumentBytes(blob: Blob): Promise<ArrayBuffer> {
  const cached = cache.get(blob);
  if (cached) return cached;

  const key = fileKey(blob);
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
