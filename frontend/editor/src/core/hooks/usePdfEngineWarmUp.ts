import { useEffect } from "react";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";
import { loadPdfjs } from "@app/services/pdfWorkerManager";

/**
 * Starts downloading the PDF engines (pdfium's 4.6 MB WASM with its JS glue, and
 * pdf.js) once the editor's first screen is up, so the first file added finds
 * them ready. Warming them at window load raced that screen: the translations
 * and route chunks it needs load after the load event, and the warm-up took the
 * bandwidth they were waiting for. Pages that never open the editor, such as the
 * mobile scanner, do not download them at all.
 */
export function usePdfEngineWarmUp(): void {
  useEffect(() => {
    const handle = requestIdleCallback(
      () => {
        startEagerWasmCompilation();
        // A failed warm-up is not an error: the first real use loads it again.
        loadPdfjs().catch(() => {});
      },
      { timeout: 2000 },
    );
    return () => cancelIdleCallback(handle);
  }, []);
}
