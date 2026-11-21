import { useContext, useEffect } from "react";
import { FileStoreContext } from "@editor/contexts/file/contexts";
import { startEagerWasmCompilation } from "@editor/services/wasmPrecompiler";

/**
 * Starts the PDFium WASM download and compile once the browser is idle after boot,
 * or sooner on a sign of a document: one already open or added, an OS file drag,
 * or the file picker opening. Every tool's preflight needs the engine.
 */
export function usePdfEngineWarmUp(): void {
  const store = useContext(FileStoreContext);

  useEffect(() => {
    const warmUp = () => startEagerWasmCompilation();
    if (store && store.getState().files.ids.length > 0) {
      warmUp();
      return;
    }

    let warmed = false;
    const warmUpOnce = () => {
      if (warmed) {
        return;
      }
      warmed = true;
      warmUp();
    };

    const unsubscribe = store
      ? store.subscribe(() => {
          if (store.getState().files.ids.length > 0) {
            warmUpOnce();
          }
        })
      : undefined;

    const onDragEnter = (event: DragEvent) => {
      // Internal reorder/drop targets also emit dragenter; only an OS file drag
      // should pull the engine down.
      if (event.dataTransfer?.types.includes("Files")) {
        warmUpOnce();
      }
    };
    // The picker is a hidden input opened with a programmatic click, which no
    // longer focuses it, so match on click as well as keyboard focus. Both are
    // scoped to the file input: a pointerdown anywhere else must not warm.
    const onFilePickerIntent = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.matches?.('input[type="file"]')) {
        warmUpOnce();
      }
    };

    // Idle preload so the first tool run never waits on the download.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warmUpOnce, { timeout: 5_000 })
        : undefined;
    const fallback =
      idle === undefined ? setTimeout(warmUpOnce, 2_000) : undefined;

    window.addEventListener("dragenter", onDragEnter, { passive: true });
    window.addEventListener("click", onFilePickerIntent, { passive: true });
    window.addEventListener("focusin", onFilePickerIntent);

    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      clearTimeout(fallback);
      unsubscribe?.();
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("click", onFilePickerIntent);
      window.removeEventListener("focusin", onFilePickerIntent);
    };
  }, [store]);
}
