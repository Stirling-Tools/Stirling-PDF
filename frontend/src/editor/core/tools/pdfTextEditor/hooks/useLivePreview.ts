import { useMemo, useRef } from "react";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

/**
 * Applies a change for real so its effect shows on the page while the user
 * is still choosing, then keeps or reverts it. Each preview is one undo step:
 * the next preview undoes it first, so trying several choices leaves only the
 * last, and keeping it leaves a single step in the history.
 */
export function useLivePreview(store: EditorStore) {
  const step = useRef<Command | null>(null);
  // Font changes load faces before they apply, so steps run one at a time.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return useMemo(() => {
    const revert = () => {
      // Only the step this preview made: an edit landed since is not ours to undo.
      if (step.current && store.history.peekUndo() === step.current)
        store.undo();
      step.current = null;
    };
    const enqueue = <T>(run: () => Promise<T> | T): Promise<T> => {
      const next = queue.current.then(run, run);
      queue.current = next.catch(() => undefined);
      return next;
    };
    return {
      preview: <T>(apply: () => Promise<T> | T): Promise<T> =>
        enqueue(async () => {
          revert();
          store.history.breakCoalescing();
          const before = store.history.peekUndo();
          const result = await apply();
          const after = store.history.peekUndo();
          step.current = after !== before ? after : null;
          return result;
        }),
      keep: () =>
        void enqueue(() => {
          step.current = null;
        }),
      cancel: () => void enqueue(revert),
    };
  }, [store]);
}
