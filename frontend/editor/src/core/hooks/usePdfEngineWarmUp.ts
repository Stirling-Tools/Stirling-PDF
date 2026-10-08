import { useContext, useEffect } from "react";
import { FileStoreContext } from "@app/contexts/file/contexts";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * Automatic warm-up delay. Long enough that the download and compile never
 * compete with the entry resources on load; the file and input triggers below
 * still start it immediately when a document is actually in play.
 */
const AUTOMATIC_WARM_UP_DELAY_MS = 10_000;

/**
 * Starts the PDFium WASM download and compile once the editor is open. Warmed
 * immediately when documents are already present or on the first pointer use,
 * drag, or file-picker focus, otherwise after {@link AUTOMATIC_WARM_UP_DELAY_MS}
 * so callers do not wait for the asset.
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

    const timerId = window.setTimeout(warmUp, AUTOMATIC_WARM_UP_DELAY_MS);

    const warmUpEarly = () => {
      window.clearTimeout(timerId);
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
      window.clearTimeout(timerId);
      window.removeEventListener("dragenter", warmUpEarly);
      window.removeEventListener("pointerdown", warmUpEarly);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [store]);
}
