import { useCallback, useEffect, useRef } from "react";

/**
 * Wraps `callback` so it runs at most once per animation frame.
 *
 * Scroll and resize fire far faster than the display paints, and a `window`
 * listener in capture phase also sees every descendant scroller. Measuring on
 * each event does more layout reads and re-renders than any frame can show,
 * which is what makes a pinned menu — and every control inside it, an open
 * colour picker included — visibly churn while scrolling.
 *
 * Calls made within a frame are dropped rather than queued, so the callback
 * always reads the latest layout when it eventually runs. The returned
 * function is stable and reads the newest `callback` through a ref, so it needs
 * no entry in a listener's dependency list.
 */
export function useAnimationFrameCallback(callback: () => void): () => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const frameRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      callbackRef.current();
    });
  }, []);
}
