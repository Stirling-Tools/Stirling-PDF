import { useEffect, useMemo, useState } from "react";
import { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";

let __singleton: EditorStore | null = null;
let __disposeTimer: ReturnType<typeof setTimeout> | null = null;

// The store is a module-level singleton, so a hot update to EditorStore.ts
// swaps the CLASS but leaves this instance - built from the old code - running.
// Every timing constant and method on it stays as it was, which makes a fix look
// like it changed nothing. Take the full reload instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}

/** Grace period before a fully-unmounted editor frees its PDFium document. */
const DISPOSE_GRACE_MS = 1500;

/** Returns the singleton editor store, plus the current view state. */
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
      // Defer disposal: if the component remounts (the effect above runs again)
      // the timer is cancelled.
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
