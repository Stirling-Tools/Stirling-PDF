import { useContext, useEffect } from "react";
import { FileStoreContext } from "@app/contexts/file/contexts";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * Starts the PDFium WASM download and compile once the editor is open. Warmed
 * on idle (or immediately when documents are already present), on the first
 * pointer use, drag, or file-picker focus so callers do not wait for the asset.
 */
export function usePdfEngineWarmUp(): void {
  const store = useContext(FileStoreContext);

  useEffect(() => {
    const warmUp = () => startEagerWasmCompilation();
    if (store && store.getState().files.ids.length > 0) {
      warmUp();
      return;
    }

    const unsubscribe = store
      ? store.subscribe(() => {
          if (store.getState().files.ids.length > 0) {
            warmUp();
          }
        })
      : undefined;

    let isIdle = false;
    let timerId: number | undefined;

    if (typeof window.requestIdleCallback === "function") {
      isIdle = true;
      timerId = window.requestIdleCallback(warmUp, { timeout: 1500 });
    } else {
      timerId = window.setTimeout(warmUp, 1000);
    }

    const cancelTimer = () => {
      if (timerId === undefined) return;
      try {
        if (isIdle && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(timerId);
        } else {
          window.clearTimeout(timerId);
        }
      } catch {
        // Fallback for timer shims or mock environments.
      }
      timerId = undefined;
    };

    const warmUpEarly = () => {
      cancelTimer();
      warmUp();
    };

    window.addEventListener("dragenter", warmUpEarly, {
      once: true,
      passive: true,
    });
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
      unsubscribe?.();
      cancelTimer();
      window.removeEventListener("dragenter", warmUpEarly);
      window.removeEventListener("pointerdown", warmUpEarly);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [store]);
}
