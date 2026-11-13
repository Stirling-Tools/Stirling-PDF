import { useDeferredValue, useMemo } from "react";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

export interface PanelView {
  state: EditorViewState;
  selection: SelectionState;
}

/** Lags a keystroke only while the selection is unchanged: panel controls act on the live selection. */
export function useDeferredPanelView(
  state: EditorViewState,
  selection: SelectionState,
): PanelView {
  const live = useMemo(() => ({ state, selection }), [state, selection]);
  const deferred = useDeferredValue(live);
  return deferred.selection === selection ? deferred : live;
}
