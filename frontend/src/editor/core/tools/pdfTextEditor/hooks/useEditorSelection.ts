import { useCallback, useSyncExternalStore } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { FindMatch } from "@editor/tools/pdfTextEditor/store/Selection";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

/**
 * The editor's selection. It changes without touching the editor state, so a
 * component reading both re-renders on either.
 */
export function useEditorSelection(store: EditorStore): SelectionState {
  const subscribe = useCallback(
    (onChange: () => void) => store.selection.subscribe(onChange),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.selection.value);
}

/** The occurrence the find bar is pointing at, or null. */
export function useFindMatch(store: EditorStore): FindMatch | null {
  const subscribe = useCallback(
    (onChange: () => void) => store.selection.highlight.subscribe(onChange),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.selection.highlight.get());
}
