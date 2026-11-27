import { useEffect, useMemo, useRef, useState } from "react";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

/** What a live preview offers the control driving it. */
export interface LivePreview {
  /** Undoes the last preview, if still undoable, then applies `apply`'s change. */
  preview: <T>(apply: () => Promise<T> | T) => Promise<T>;
  /** Keeps what is showing as one undo step. */
  keep: () => void;
  /** Undoes the preview. */
  cancel: () => void;
  /** Whether a change is showing that `keep` would keep. */
  active: boolean;
}

/**
 * Applies a change for real so its effect shows on the page while the user
 * is still choosing, then keeps or reverts it. Each preview is one undo step:
 * the next preview undoes it first, so trying several choices leaves only the
 * last, and keeping it leaves a single step in the history. A preview neither
 * kept nor cancelled is undone when its control goes away.
 */
export function useLivePreview(store: EditorStore): LivePreview {
  const step = useRef<Command | null>(null);
  // Font changes load faces before they apply, so steps run one at a time.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [active, setActive] = useState(false);
  const api = useMemo(() => {
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
          setActive(step.current !== null);
          return result;
        }),
      keep: () =>
        void enqueue(() => {
          step.current = null;
          // A later change must not join the kept step's undo.
          store.history.breakCoalescing();
          setActive(false);
        }),
      cancel: () =>
        void enqueue(() => {
          revert();
          setActive(false);
        }),
      // For unmount: the component is going, so no state to set.
      discard: () => void enqueue(revert),
    };
  }, [store]);

  useEffect(() => api.discard, [api]);

  return {
    preview: api.preview,
    keep: api.keep,
    cancel: api.cancel,
    active,
  };
}
