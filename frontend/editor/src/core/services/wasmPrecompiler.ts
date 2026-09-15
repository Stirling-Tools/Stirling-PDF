import { BASE_PATH } from "@app/constants/app";
import pdfiumWasmAssetUrl from "@embedpdf/pdfium/pdfium.wasm?url";

const getWasmUrl = (): string => {
  // In dev, Vite serves the statically-copied asset from the dev server root.
  if (import.meta.env.DEV) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
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

// No preload link: WebKit does not reuse a preloaded fetch for
// compileStreaming and downloaded the wasm twice; Chromium gains ~10 ms. The
// eager compile runs on import, so the fetch still starts before React mounts.
export interface WasmModuleContainer {
  module: WebAssembly.Module | null;
}

let resolvePromise: (container: WasmModuleContainer | null) => void;
let compilationStarted = false;

export const pdfiumWasmModulePromise = new Promise<WasmModuleContainer | null>(
  (resolve) => {
    resolvePromise = resolve;
  },
);

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  if (typeof WebAssembly !== "object") {
    resolvePromise(null);
    return;
  }

  const compileWithFallback = async (): Promise<WebAssembly.Module | null> => {
    try {
      if (typeof WebAssembly.compileStreaming === "function") {
        try {
          return await WebAssembly.compileStreaming(fetch(pdfiumWasmUrl));
        } catch (streamingErr) {
          console.warn(
            "WASM compileStreaming failed, falling back to ArrayBuffer:",
            streamingErr,
          );
        }
      }

      // compileStreaming requires application/wasm MIME; fall back to ArrayBuffer if the server or proxy serves octet-stream.
      const res = await fetch(pdfiumWasmUrl);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch WASM: ${res.status} ${res.statusText}`,
        );
      }
      const buffer = await res.arrayBuffer();
      return await WebAssembly.compile(buffer);
    } catch (err) {
      console.warn("WASM compilation failed:", err);
      return null;
    }
  };

  compileWithFallback()
    .then((module) => {
      resolvePromise(module ? { module } : null);
    })
    .catch(() => resolvePromise(null));
}

// Start at module-eval time (before React mounts) so the binary fetch and
// compile begin as early as the removed preload link did; the flag in
// startEagerWasmCompilation keeps later callers as no-ops. Skipped under
// vitest so service tests do not issue a real fetch on import.
if (import.meta.env.MODE !== "test") {
  startEagerWasmCompilation();
}
