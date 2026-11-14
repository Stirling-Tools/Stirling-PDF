import { useCallback, useSyncExternalStore } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

export function useEditorSelection(store: EditorStore): SelectionState {
  const subscribe = useCallback(
    (onChange: () => void) => store.selection.subscribe(onChange),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.selection.value);
}

/** The run the find bar is pointing at, or null. */
export function useHighlightedRunId(store: EditorStore): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => store.selection.highlight.subscribe(onChange),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.selection.highlight.get());
}
