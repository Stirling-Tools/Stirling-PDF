import { useCallback, useReducer } from "react";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";

interface PreviewHistory {
  past: SignaturePreview[][];
  present: SignaturePreview[];
  committed: SignaturePreview[];
  future: SignaturePreview[][];
}

type Action =
  | { type: "change"; previews: SignaturePreview[]; transient: boolean }
  | { type: "reset"; previews: SignaturePreview[] }
  | { type: "undo" | "redo" };

function initialState(previews: SignaturePreview[]): PreviewHistory {
  return { past: [], present: previews, committed: previews, future: [] };
}

function reduceHistory(state: PreviewHistory, action: Action): PreviewHistory {
  switch (action.type) {
    case "reset":
      return initialState(action.previews);
    case "change":
      if (action.transient) return { ...state, present: action.previews };
      if (action.previews === state.committed)
        return { ...state, present: action.previews };
      return {
        past: [...state.past, state.committed].slice(-100),
        present: action.previews,
        committed: action.previews,
        future: [],
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        committed: previous,
        future: [state.committed, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.committed],
        present: next,
        committed: next,
        future: state.future.slice(1),
      };
    }
  }
}

/** Keeps up to 100 edits; transient drag updates form one undo step when committed. Reset discards document history. */
export function useSignaturePreviewHistory(initial: SignaturePreview[] = []) {
  const [state, dispatch] = useReducer(reduceHistory, initial, initialState);
  const change = useCallback(
    (previews: SignaturePreview[], transient = false) => {
      dispatch({ type: "change", previews, transient });
    },
    [],
  );
  const reset = useCallback((previews: SignaturePreview[]) => {
    dispatch({ type: "reset", previews });
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    previews: state.present,
    change,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
