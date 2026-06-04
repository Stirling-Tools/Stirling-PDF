let resolvePromise: (module: WebAssembly.Module | null) => void;
let compilationStarted = false;

export const pdfiumWasmModulePromise = new Promise<WebAssembly.Module | null>((resolve) => {
  resolvePromise = resolve;
});

export function startEagerWasmCompilation(): void {
  if (compilationStarted) return;
  compilationStarted = true;

  const base = import.meta.env.BASE_URL || "/";
  const wasmUrl = `${base}pdfium/pdfium.wasm`.replace(/\/\//g, "/");

  if (
    typeof WebAssembly === "object" &&
    typeof WebAssembly.compileStreaming === "function"
  ) {
    WebAssembly.compileStreaming(fetch(wasmUrl))
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
