// Fetch the active .onnx from the backend serve endpoint, verify its SHA-256, and keep it in the
// Cache API keyed by checksum so it is downloaded only once per device (then reused across reloads).

const MODEL_FILE_URL = "/api/v1/form/form-detection-model/file";
const CACHE_NAME = "stirling-form-detection-models";

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function readWithProgress(
  res: Response,
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<ArrayBuffer> {
  const lengthHeader = res.headers.get("content-length");
  const total = lengthHeader ? Number(lengthHeader) || null : null;
  if (!onProgress || !res.body) {
    return res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Browsers only expose Web Crypto in a secure context, so an http:// deployment cannot hash the
 * model it just downloaded.
 */
export class ChecksumUnsupportedError extends Error {
  constructor() {
    super(
      "The model cannot be verified because Web Crypto is unavailable; serve the app over HTTPS (or localhost) to run detection in the browser",
    );
    this.name = "ChecksumUnsupportedError";
  }
}

/** Whether this context can hash the downloaded model at all. */
export function canVerifyChecksums(): boolean {
  return typeof crypto !== "undefined" && crypto.subtle != null;
}

async function verify(bytes: ArrayBuffer, expectedSha?: string): Promise<void> {
  if (!expectedSha) return;
  // Refusing beats skipping the check: an unverified model would go on to build a form the user
  // has no way to know was never validated.
  if (!canVerifyChecksums()) {
    throw new ChecksumUnsupportedError();
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = toHex(digest);
  if (actual.toLowerCase() !== expectedSha.toLowerCase()) {
    throw new Error(
      `Model checksum mismatch (expected ${expectedSha}, got ${actual})`,
    );
  }
}

/**
 * Return the active model bytes, from the Cache API when present (and checksum-valid) or by
 * downloading from the backend. The cache key is the checksum, so a model swap naturally misses.
 */
export async function loadModelBytes(
  expectedSha?: string,
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<ArrayBuffer> {
  const cacheKey = `${MODEL_FILE_URL}#${expectedSha ?? "nosha"}`;
  // Cache API is unavailable in non-secure contexts; degrade to a plain download in that case.
  const cache = await caches.open(CACHE_NAME).catch(() => null);

  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) {
      const buf = await hit.arrayBuffer();
      try {
        await verify(buf, expectedSha);
        return buf;
      } catch {
        await cache.delete(cacheKey).catch(() => false); // stale/corrupt - re-download
      }
    }
  }

  const res = await fetch(MODEL_FILE_URL, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Model download failed: HTTP ${res.status}`);
  }
  const buf = await readWithProgress(res, onProgress);
  await verify(buf, expectedSha);

  if (cache) {
    await cache
      .put(
        cacheKey,
        new Response(buf, {
          headers: { "Content-Type": "application/octet-stream" },
        }),
      )
      .catch(() => undefined); // best-effort; ignore quota/availability errors
  }
  return buf;
}
