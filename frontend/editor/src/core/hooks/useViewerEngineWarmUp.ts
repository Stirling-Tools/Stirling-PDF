/**
 * Starts the viewer engine (worker pool plus the precompiled pdfium instance)
 * once the app shell is open, on the first pointer use, drag, file-picker
 * focus, or after 10 s, so the engine is ready before a document lands. Scoped
 * away from the standalone mobile routes, which never open a document; the
 * engine is created on demand anyway, this only moves the cost off the open.
 */
import { useEffect } from "react";
import { warmUpViewerEngine } from "@app/hooks/useLocalPdfiumEngine";
import { getLocalFontFallbackConfig } from "@app/services/pdfiumFontFallback";
import { pdfiumWasmUrl } from "@app/services/wasmPrecompiler";

export function useViewerEngineWarmUp(): void {
  useEffect(() => {
    const warmUp = () =>
      void warmUpViewerEngine({
        wasmUrl: pdfiumWasmUrl,
        fontFallback: getLocalFontFallbackConfig(),
      }).catch(() => {
        // The viewer surfaces the failure; the warm-up only spends the time.
      });
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
