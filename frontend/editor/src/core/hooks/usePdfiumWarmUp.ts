import { useEffect } from "react";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * Starts downloading pdfium (its 4.6 MB WASM and the JS glue) once the editor's
 * first screen is up. Warming it at window load raced that screen: the
 * translations and route chunks it needs load after the load event, and the
 * warm-up took the bandwidth they were waiting for. Pages that never open the
 * editor, such as the mobile scanner, no longer download it at all.
 */
export function usePdfiumWarmUp(): void {
  useEffect(() => {
    const handle = requestIdleCallback(() => startEagerWasmCompilation(), {
      timeout: 2000,
    });
    return () => cancelIdleCallback(handle);
  }, []);
}
