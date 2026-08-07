import { useEffect, useMemo, useState } from "react";
import { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";

let __singleton: EditorStore | null = null;
let __disposeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Grace period before a fully-unmounted editor frees its PDFium document.
 * Long enough to ride out a StrictMode double-mount or a sidebar/workbench
 * remount (which re-runs the effect and cancels the timer), short enough
 * that genuinely navigating away reclaims the WASM doc + history buffers.
 */
const DISPOSE_GRACE_MS = 1500;

/**
 * Returns the singleton editor store, plus the current view state.
 *
 * The store survives StrictMode double-mounts and tool remounts so an
 * in-progress edit isn't wiped if the user toggles a sidebar or switches
 * between tools that share the workbench area.
 */
export function useEditorStore(): {
  store: EditorStore;
  state: ReturnType<EditorStore["getState"]>;
} {
  const store = useMemo(() => {
    if (!__singleton) __singleton = new EditorStore();
    return __singleton;
  }, []);
  const [state, setState] = useState(store.getState());
  useEffect(() => {
    // A pending disposal means we just remounted within the grace window
    // (StrictMode / sidebar toggle) - cancel it so the open doc survives.
    if (__disposeTimer) {
      clearTimeout(__disposeTimer);
      __disposeTimer = null;
    }
    setState(store.getState());
    const unsubscribe = store.subscribe(setState);
    return () => {
      unsubscribe();
      // Defer disposal: if the component remounts (the effect above runs
      // again) the timer is cancelled. If it stays unmounted (navigated
      // away), free the PDFium document and history-pinned image buffers.
      if (__disposeTimer) clearTimeout(__disposeTimer);
      __disposeTimer = setTimeout(() => {
        __disposeTimer = null;
        __singleton?.clearDocument();
      }, DISPOSE_GRACE_MS);
    };
  }, [store]);
  return { store, state };
}

/** Test-only - drop the singleton so the next mount starts fresh. */
export function __resetEditorStoreForTests(): void {
  if (__singleton) {
    __singleton.dispose();
    __singleton = null;
  }
}
