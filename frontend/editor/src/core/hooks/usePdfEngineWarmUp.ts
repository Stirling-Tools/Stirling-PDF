import { useEffect } from "react";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * Starts the pdfium WASM download and compile once the editor is open, on the
 * first pointer use, drag, file-picker focus, or after 10 s. Scoped to the
 * editor's routes so screens that never open a document, such as the mobile
 * scanner, do not pay for it; and deferred past the first screen so the warm-up
 * does not compete with the resources it is waiting for.
 */
export function usePdfEngineWarmUp(): void {
  useEffect(() => {
    const warmUp = () => startEagerWasmCompilation();
    const timer = window.setTimeout(warmUp, 10_000);
    const warmUpEarly = () => {
      window.clearTimeout(timer);
      warmUp();
    };
    window.addEventListener("dragenter", warmUpEarly, {
      once: true,
      passive: true,
    });
    // First pointer use buys the click-to-pick gap as a head start.
    window.addEventListener("pointerdown", warmUpEarly, {
      once: true,
      passive: true,
    });
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (target?.matches?.('input[type="file"]')) warmUpEarly();
    };
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("dragenter", warmUpEarly);
      window.removeEventListener("pointerdown", warmUpEarly);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, []);
}
