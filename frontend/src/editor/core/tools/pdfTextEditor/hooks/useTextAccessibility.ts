import { useMemo } from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  SelectionState,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import {
  textTag,
  type TextTag,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";

/** The tag of the selected text: null unless exactly one run and nothing else is selected. */
export function useTextAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): TextTag | null {
  const run = useMemo((): TextRunSnapshot | null => {
    if (
      selection.runIds.length !== 1 ||
      selection.imageIds.length > 0 ||
      selection.shapeIds.length > 0
    )
      return null;
    return (
      state.pages
        .flatMap((page) => page.runs)
        .find((r) => r.id === selection.runIds[0]) ?? null
    );
  }, [state.pages, selection]);

  return useMemo(() => {
    const doc = store.document;
    return doc && run ? textTag(doc, run) : null;
  }, [store, run]);
}
