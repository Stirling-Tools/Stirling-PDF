import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A function that keeps one identity for the component's lifetime and always
 * calls the latest `callback`. Use it for event handlers that would otherwise
 * be re-memoised whenever their data changes.
 *
 * A memoised handler holds the render it was made in, and through it every
 * handler that render held, so a component whose handlers are re-memoised at
 * different times keeps a chain of its old renders, and their data, alive.
 *
 * Not for calling during render: the latest `callback` is installed when the
 * render commits.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
