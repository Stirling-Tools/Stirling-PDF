import { useEffect, useRef } from "react";

const DEFAULT_WINDOW_MS = 300;

/**
 * Rate-limits `callback` to one run per `windowMs`, trailing after the first,
 * which runs immediately. Runs are independent, a later one does not wait for
 * an earlier to settle, so a caller publishing state must drop results
 * superseded by a later run.
 *
 * `callback` is a dependency, so memoize it - a fresh closure each render would
 * schedule a run every render. Rejections are logged, not propagated.
 */
export function useCoalescedCallback(
  callback: () => void | Promise<void>,
  trigger: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const lastRunAt = useRef(0);

  useEffect(() => {
    const run = async (): Promise<void> => {
      lastRunAt.current = Date.now();
      try {
        await callback();
      } catch (error) {
        console.error("[useCoalescedCallback] callback failed:", error);
      }
    };

    // Anchored to the last run's start, so the window bounds the run rate
    // rather than each run's duration.
    const wait = Math.max(0, lastRunAt.current + windowMs - Date.now());
    const timer = window.setTimeout(() => void run(), wait);
    return () => window.clearTimeout(timer);
  }, [callback, trigger, windowMs]);
}
