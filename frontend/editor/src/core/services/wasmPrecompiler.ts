import { BASE_PATH } from "@app/constants/app";
import pdfiumWasmAssetUrl from "@embedpdf/pdfium/pdfium.wasm?url";

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

let resolvePromise: (module: WebAssembly.Module | null) => void;
let compilationStarted = false;

export const pdfiumWasmModulePromise = new Promise<WebAssembly.Module | null>(
  (resolve) => {
    resolvePromise = resolve;
  },
);

/**
 * Compile the WASM without streaming by fetching the whole binary first.
 *
 * `compileStreaming` requires the response to be served with the
 * `application/wasm` MIME type and no incompatible `Content-Encoding`. Under the
 * `tauri://` asset protocol (and behind some proxies) those headers aren't
 * guaranteed, which makes streaming compilation throw. Fetching the bytes and
 * compiling them directly sidesteps the MIME/encoding requirement entirely.
 */
async function compileFromArrayBuffer(): Promise<WebAssembly.Module | null> {
  try {
    const response = await fetch(pdfiumWasmUrl);
    if (!response.ok) {
      throw new Error(`Unexpected response ${response.status} for pdfium.wasm`);
    }
    const bytes = await response.arrayBuffer();
    return await WebAssembly.compile(bytes);
  } catch (err) {
    console.warn("Eager WASM ArrayBuffer compilation failed:", err);
    return null;
  }
}

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  if (typeof WebAssembly !== "object") {
    resolvePromise(null);
    return;
  }

  // Prefer streaming compilation, but fall back to fetching the bytes and
  // compiling them directly when streaming isn't available or fails (e.g. wrong
  // MIME type / content-encoding under the tauri:// protocol). Resolving null on
  // total failure lets pdfiumService fall back to its own instantiation path.
  if (typeof WebAssembly.compileStreaming === "function") {
    WebAssembly.compileStreaming(fetch(pdfiumWasmUrl))
      .then(resolvePromise)
      .catch((err) => {
        console.warn(
          "Eager WASM streaming compilation failed, falling back to ArrayBuffer:",
          err,
        );
        compileFromArrayBuffer().then(resolvePromise);
      });
  } else {
    compileFromArrayBuffer().then(resolvePromise);
  }
}
