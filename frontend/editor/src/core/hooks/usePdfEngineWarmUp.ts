import { useContext, useEffect } from "react";
import { FileStoreContext } from "@app/contexts/file/contexts";
import { startEagerWasmCompilation } from "@app/services/wasmPrecompiler";

/**
 * Starts the PDFium WASM download and compile only once a document is actually
 * in play: documents already open, a document added, an OS file drag, or the
 * file picker opening. A page the user merely visits fetches nothing, so the
 * engine cost lands only on sessions that will open a PDF.
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

    window.addEventListener("dragenter", onDragEnter, { passive: true });
    window.addEventListener("click", onFilePickerIntent, { passive: true });
    window.addEventListener("focusin", onFilePickerIntent);

    return () => {
      unsubscribe?.();
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("click", onFilePickerIntent);
      window.removeEventListener("focusin", onFilePickerIntent);
    };
  }, [store]);
}
