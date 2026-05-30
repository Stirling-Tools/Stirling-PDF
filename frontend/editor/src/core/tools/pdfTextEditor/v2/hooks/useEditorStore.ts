import { useEffect, useMemo, useState } from "react";
import { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";

let __singleton: EditorStore | null = null;

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
    setState(store.getState());
    return store.subscribe(setState);
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
