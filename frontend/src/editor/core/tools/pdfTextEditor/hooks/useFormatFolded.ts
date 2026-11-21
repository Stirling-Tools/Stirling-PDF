import { useSyncExternalStore } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

interface FoldState {
  folded: boolean;
  listeners: Set<() => void>;
}

const states = new WeakMap<EditorStore, FoldState>();

function stateFor(store: EditorStore): FoldState {
  let state = states.get(store);
  if (!state) {
    state = { folded: false, listeners: new Set() };
    states.set(store, state);
  }
  return state;
}

export function setFormatFolded(store: EditorStore, folded: boolean): void {
  const state = stateFor(store);
  if (state.folded === folded) return;
  state.folded = folded;
  for (const listener of state.listeners) listener();
}

export function useFormatFolded(store: EditorStore | null): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!store) return () => undefined;
      const { listeners } = stateFor(store);
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (store ? stateFor(store).folded : false),
  );
}
