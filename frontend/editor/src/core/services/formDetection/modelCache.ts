// Fetch the active .onnx from the backend serve endpoint, verify its SHA-256, and keep it in the
// Cache API keyed by checksum so it is downloaded only once per device (then reused across reloads).

const MODEL_FILE_URL = "/api/v1/ai/form-detection-model/file";
const CACHE_NAME = "stirling-form-detection-models";

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function verify(bytes: ArrayBuffer, expectedSha?: string): Promise<void> {
  if (!expectedSha) return;
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
export async function loadModelBytes(expectedSha?: string): Promise<ArrayBuffer> {
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
  const buf = await res.arrayBuffer();
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
