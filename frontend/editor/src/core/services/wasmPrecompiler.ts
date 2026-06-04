import { BASE_PATH } from "@app/constants/app";
import pdfiumWasmAssetUrl from "@embedpdf/pdfium/pdfium.wasm?url";

const getWasmUrl = (): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (import.meta.env.DEV) {
    return `${origin}${BASE_PATH}/pdfium/pdfium.wasm`;
  }
  const cleanAssetUrl = pdfiumWasmAssetUrl.replace(/^\.\//, "").replace(/^\//, "");
  return `${origin}${BASE_PATH}/${cleanAssetUrl}`;
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
