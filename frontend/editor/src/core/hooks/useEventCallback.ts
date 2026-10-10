import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Wraps `callback` in a function whose identity never changes while still
 * calling the newest `callback`.
 *
 * This is the supported way to hand a child a callback that must read current
 * props and state. Writing the ref during render would expose values from a tree
 * that concurrent rendering may discard, and `useEffectEvent` cannot be passed
 * to child components (https://react.dev/reference/react/useEffectEvent).
 * Updating in a layout effect keeps the ref in step with committed state, before
 * the browser can dispatch an event.
 */
export function useEventCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}
