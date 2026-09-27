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
    if (typeof window === "undefined") return;
    let active = true;
    let didWarmUp = false;
    const warmUp = () => {
      if (didWarmUp || !active) return;
      didWarmUp = true;
      void warmUpViewerEngine({
        wasmUrl: pdfiumWasmUrl,
        fontFallback: getLocalFontFallbackConfig(),
      }).catch(() => {
        // The viewer surfaces the failure; the warm-up only spends the time.
      });
    };
    const win = window as unknown as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: number | null = null;
    const cancelScheduled = () => {
      if (timerHandle !== null) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
      if (idleHandle !== null) {
        if (typeof win.cancelIdleCallback === "function") {
          try {
            win.cancelIdleCallback(idleHandle);
          } catch {
            // Ignored in environments where cancelIdleCallback shim mismatches fake timers.
          }
        } else {
          clearTimeout(idleHandle);
        }
        idleHandle = null;
      }
    };
    const warmUpEarly = () => {
      cancelScheduled();
      warmUp();
    };
    if (typeof win.requestIdleCallback === "function") {
      idleHandle = win.requestIdleCallback(warmUpEarly, { timeout: 1500 });
    } else {
      timerHandle = setTimeout(warmUpEarly, 400);
    }
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
      active = false;
      cancelScheduled();
      window.removeEventListener("dragenter", warmUpEarly);
      window.removeEventListener("pointerdown", warmUpEarly);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, []);
}
