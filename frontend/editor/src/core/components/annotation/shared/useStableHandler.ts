import { useCallback, useRef } from "react";

/**
 * Wraps `fn` in a callback whose identity never changes, while still calling the
 * newest `fn`.
 *
 * The annotation menu rebuilds on every annotation update, and handlers rebuilt
 * from it (`onColorChange`, `onOpacityChange`) come with a new identity each
 * time. Anything memoised on those handlers — the Mantine picker and sliders —
 * would miss every update it actually needs to react to.
 */
export function useStableHandler<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref reads are stable
  return useCallback((...args: A) => ref.current(...args), []);
}
