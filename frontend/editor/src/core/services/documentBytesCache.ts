/**
 * One ArrayBuffer per document, shared by the viewer's scans (form fields,
 * signature/button appearances, measurement scales).
 *
 * Callers must not detach the returned buffer: pdf.js transfers whatever it is
 * given, so anything that hands bytes to pdf.js has to pass a URL instead.
 *
 * Files are also keyed by name/size/type/mtime: the add path re-wraps the same
 * bytes as fresh `File` objects, so identity alone would read every document
 * once per wrapper. Bare Blobs stay identity-keyed — they carry no metadata.
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
