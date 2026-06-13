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

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  if (
    typeof WebAssembly === "object" &&
    typeof WebAssembly.compileStreaming === "function"
  ) {
    WebAssembly.compileStreaming(fetch(pdfiumWasmUrl))
      .then(resolvePromise)
      .catch((err) => {
        console.warn(
          "Eager WASM compilation failed or not supported in this environment:",
          err,
        );
        resolvePromise(null);
      });
  } else {
    resolvePromise(null);
  }
}
