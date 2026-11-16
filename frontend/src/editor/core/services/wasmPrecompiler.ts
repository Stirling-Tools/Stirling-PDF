import pdfiumWasmAssetUrl from "@embedpdf/pdfium/pdfium.wasm?url";

// Resolved against the document: the raw URL is relative in dev, and workers
// need an absolute URL too.
const getWasmUrl = (): string => {
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

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  if (typeof WebAssembly !== "object") {
    resolvePromise(null);
    return;
  }

  // The JS glue that runs this WASM is a lazy chunk. Fetch it in the same idle
  // slot so the first thumbnail or form read waits for neither. A failure here
  // is left to pdfiumService, whose own import retries it and reports it.
  import("@embedpdf/pdfium").catch(() => {});

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
    .then(resolvePromise)
    .catch(() => resolvePromise(null));
}
