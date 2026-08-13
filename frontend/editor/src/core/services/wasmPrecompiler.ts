import { BASE_PATH } from "@app/constants/app";
import pdfiumWasmAssetUrl from "@embedpdf/pdfium/pdfium.wasm?url";

/**
 * Content-hash branded cache key. A string alone is too easy to confuse with
 * a URL or an arbitrary ID; the brand makes the value's origin explicit at
 * every call site that touches the wasm module cache.
 */
export type ContentHash = string & { readonly __brand: "ContentHash" };

const WASM_DB_NAME = "stirling-pdf-wasm-cache";
const WASM_DB_VERSION = 1;
const MODULE_STORE = "compiled-modules";
const META_STORE = "meta";
const META_KEY = "current-module-hash";

const getWasmUrl = (): string => {
  // In dev, Vite serves the statically-copied asset from the dev server root.
  if (import.meta.env.DEV) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${BASE_PATH}/pdfium/pdfium.wasm`;
  }

  // Vite has already produced a base-aware asset URL (absolute under a relative
  // base, root-relative under an absolute base). Resolve it against the document
  // to get a fetchable absolute URL that is also safe to pass to Web Workers.
  if (typeof window !== "undefined") {
    return new URL(pdfiumWasmAssetUrl, window.location.href).href;
  }
  return pdfiumWasmAssetUrl;
};

export const pdfiumWasmUrl = getWasmUrl();

/** SHA-256 of the wasm binary, hex-encoded and branded as a ContentHash. */
async function hashBytes(
  bytes: Uint8Array<ArrayBufferLike>,
): Promise<ContentHash> {
  // The typed array came from fetch(), which never returns a SharedArrayBuffer;
  // lib.dom's BufferSource typing is stricter than reality.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer as ArrayBuffer,
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex as ContentHash;
}

interface WasmCacheDb {
  db: IDBDatabase;
  getModule(hash: ContentHash): Promise<WebAssembly.Module | null>;
  putModule(hash: ContentHash, module: WebAssembly.Module): Promise<void>;
  getCurrentHash(): Promise<ContentHash | null>;
  setCurrentHash(hash: ContentHash): Promise<void>;
}

function openWasmCacheDb(): Promise<WasmCacheDb | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(WASM_DB_NAME, WASM_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODULE_STORE)) {
        db.createObjectStore(MODULE_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = (store: string, mode: IDBTransactionMode): IDBObjectStore =>
        db.transaction(store, mode).objectStore(store);
      const api: WasmCacheDb = {
        db,
        getModule(hash) {
          return new Promise((res) => {
            const req = tx(MODULE_STORE, "readonly").get(hash);
            req.onsuccess = () =>
              res(req.result instanceof WebAssembly.Module ? req.result : null);
            req.onerror = () => res(null);
          });
        },
        putModule(hash, module) {
          return new Promise((res) => {
            // Persist the compiled module keyed by its hash. Storage goes
            // through IndexedDB's structured-clone algorithm; browsers that
            // do not support serializing WebAssembly.Module throw a
            // DataCloneError here, which is handled by the caller.
            let req: IDBRequest;
            try {
              req = tx(MODULE_STORE, "readwrite").put(module, hash);
            } catch {
              res();
              return;
            }
            req.onsuccess = () => res();
            req.onerror = () => res();
          });
        },
        getCurrentHash() {
          return new Promise((res) => {
            const req = tx(META_STORE, "readonly").get(META_KEY);
            req.onsuccess = () =>
              res(
                typeof req.result === "string"
                  ? (req.result as ContentHash)
                  : null,
              );
            req.onerror = () => res(null);
          });
        },
        setCurrentHash(hash) {
          return new Promise((res) => {
            const req = tx(META_STORE, "readwrite").put(hash, META_KEY);
            req.onsuccess = () => res();
            req.onerror = () => res();
          });
        },
      };
      resolve(api);
    };
    request.onerror = () => resolve(null);
  });
}

let cacheDbPromise: Promise<WasmCacheDb | null> | null = null;

function getCacheDb(): Promise<WasmCacheDb | null> {
  if (!cacheDbPromise) cacheDbPromise = openWasmCacheDb();
  return cacheDbPromise;
}

/**
 * Drop every compiled module except the one for `keep`. Compiled modules are
 * tens of MB of retained memory; without cleanup every app update leaks the
 * previous release's module forever.
 */
async function pruneOldModules(
  db: WasmCacheDb,
  keep: ContentHash,
): Promise<void> {
  try {
    const tx = db.db.transaction(MODULE_STORE, "readwrite");
    const store = tx.objectStore(MODULE_STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      for (const key of keysReq.result) {
        if (key !== keep) store.delete(key);
      }
    };
  } catch {
    /* best-effort */
  }
}

/**
 * Compile the wasm bytes. Primary path is compileStreaming against a
 * synthetic application/wasm Response; the buffer-compile path runs only when
 * compileStreaming is unavailable.
 */
async function compileBytes(
  bytes: Uint8Array<ArrayBufferLike>,
): Promise<WebAssembly.Module | null> {
  if (typeof WebAssembly.compileStreaming === "function") {
    try {
      const response = new Response(bytes.buffer as ArrayBuffer, {
        headers: { "content-type": "application/wasm" },
      });
      return await WebAssembly.compileStreaming(response);
    } catch (err) {
      console.warn("[pdfium] compileStreaming failed, falling back:", err);
    }
  }
  try {
    return await WebAssembly.compile(bytes.buffer as ArrayBuffer);
  } catch (err) {
    console.warn("[pdfium] WebAssembly.compile failed:", err);
    return null;
  }
}

/**
 * Load a compiled pdfium WebAssembly.Module:
 *
 *  1. Compute the binary's content hash and check IndexedDB - repeat visitors
 *     skip the fetch+compile entirely (module restore is instant).
 *  2. On miss, fetch with credentials: "omit" (the wasm is a public asset and
 *     cookie-free fetches are eligible for more cache tiers).
 *  3. Compile via compileStreaming (native Content-Encoding br/zstd is
 *     handled by the browser); buffer compile only as the guarded fallback.
 *  4. Persist the module keyed by its ContentHash and prune older modules.
 */
async function loadCompiledModule(): Promise<WebAssembly.Module | null> {
  try {
    const response = await fetch(pdfiumWasmUrl, { credentials: "omit" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hash = await hashBytes(bytes);

    const db = await getCacheDb();
    if (db) {
      const cached = await db.getModule(hash);
      if (cached) return cached;
    }

    const module = await compileBytes(bytes);
    if (module && db) {
      await db.putModule(hash, module);
      await db.setCurrentHash(hash);
      void pruneOldModules(db, hash);
    }
    return module;
  } catch (err) {
    console.warn("[pdfium] module load failed:", err);
    return null;
  }
}

let resolvePromise: (module: WebAssembly.Module | null) => void;
let compilationStarted = false;

export const pdfiumWasmModulePromise = new Promise<WebAssembly.Module | null>(
  (resolve) => {
    resolvePromise = resolve;
  },
);

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  loadCompiledModule()
    .then(resolvePromise)
    .catch((err) => {
      console.warn(
        "Eager WASM compilation failed or not supported in this environment:",
        err,
      );
      resolvePromise(null);
    });
}

/**
 * Instantiate a fresh pdfium instance, using the cached/precompiled module
 * path with streaming compilation as the fallback. Used by pdfiumService's
 * `instantiateWasm` override when the eagerly-compiled module is unavailable.
 */
export async function instantiatePdfiumWithFallback(
  imports: WebAssembly.Imports,
): Promise<{ instance: WebAssembly.Instance; module: WebAssembly.Module }> {
  const module = await loadCompiledModule();
  if (!module) {
    throw new Error("[pdfium] no wasm module available for instantiation");
  }
  const instance = await WebAssembly.instantiate(module, imports);
  return { instance, module };
}
