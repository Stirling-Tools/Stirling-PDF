import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

let __singleton: EditorStore | null = null;
let __disposeTimer: ReturnType<typeof setTimeout> | null = null;
let __owners = 0;

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

function sharedStore(): EditorStore {
  if (!__singleton) __singleton = new EditorStore();
  return __singleton;
}

type EditorViewState = ReturnType<EditorStore["getState"]>;

/**
 * The singleton editor store and its state, owning the open document: once the
 * last owner unmounts, the document is freed after a grace period.
 */
export function useEditorStore(): {
  store: EditorStore;
  state: EditorViewState;
} {
  const view = useEditorStoreView();
  useEffect(() => {
    __owners += 1;
    // A pending disposal means we just remounted within the grace window
    // (StrictMode / sidebar toggle) - cancel it so the open doc survives.
    if (__disposeTimer) {
      clearTimeout(__disposeTimer);
      __disposeTimer = null;
    }
    return () => {
      __owners -= 1;
      // Counted, not last-unmount-wins: the text editor can unmount after the
      // review's editor has mounted, and freeing then drops its unsaved edits.
      if (__owners > 0) return;
      if (__disposeTimer) clearTimeout(__disposeTimer);
      __disposeTimer = setTimeout(() => {
        __disposeTimer = null;
        __singleton?.clearDocument();
      }, DISPOSE_GRACE_MS);
    };
  }, []);
  return view;
}

/**
 * The singleton editor store and its state, without owning the document's
 * lifetime: viewer pages mount and unmount as they scroll, and an owning hook
 * there would drop the document every time a page left the screen.
 */
export function useEditorStoreView(): {
  store: EditorStore;
  state: EditorViewState;
} {
  const store = useSharedEditorStore();
  const state = useEditorState(store, identity);
  return { store, state };
}

/**
 * The singleton editor store without subscribing to its state; pair it with
 * `useEditorState` to re-render on just the slice a component reads.
 */
export function useSharedEditorStore(): EditorStore {
  return useMemo(sharedStore, []);
}

/**
 * One slice of the editor's state; re-renders only when that slice changes
 * identity, so `select` must return stored values, not build new ones.
 */
export function useEditorState<T>(
  store: EditorStore,
  select: (state: EditorViewState) => T,
): T {
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(onChange),
    [store],
  );
  return useSyncExternalStore(subscribe, () => select(store.getState()));
}

function identity<T>(value: T): T {
  return value;
}

/** Test-only - drop the singleton so the next mount starts fresh. */
export function __resetEditorStoreForTests(): void {
  if (__singleton) {
    __singleton.dispose();
    __singleton = null;
  }
}
