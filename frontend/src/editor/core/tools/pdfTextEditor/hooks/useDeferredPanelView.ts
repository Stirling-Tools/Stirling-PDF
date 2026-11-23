import { useDeferredValue, useMemo } from "react";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

export interface PanelView {
  state: EditorViewState;
  selection: SelectionState;
}

const TYPED_CONTENT_KEYS: ReadonlySet<string> = new Set<keyof EditorViewState>([
  "pages",
  "dirty",
  "documentLanguage",
  "languagesInUse",
]);

function onlyContentChanged(
  stale: EditorViewState,
  live: EditorViewState,
): boolean {
  for (const key of Object.keys(live) as (keyof EditorViewState)[]) {
    if (!TYPED_CONTENT_KEYS.has(key) && stale[key] !== live[key]) return false;
  }
  return true;
}

/** Lags a keystroke only while the selection and view settings are unchanged: a toggle reading a stale setting flips it back. */
export function useDeferredPanelView(
  state: EditorViewState,
  selection: SelectionState,
): PanelView {
  const live = useMemo(() => ({ state, selection }), [state, selection]);
  const deferred = useDeferredValue(live);
  return deferred.selection === selection &&
    onlyContentChanged(deferred.state, state)
    ? deferred
    : live;
}
