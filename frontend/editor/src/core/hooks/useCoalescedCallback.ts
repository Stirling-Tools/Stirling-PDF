import { useEffect, useRef } from "react";

const DEFAULT_WINDOW_MS = 300;

/**
 * Runs `callback` at most once per `windowMs`, trailing, and immediately on the
 * first trigger. A burst of `trigger` changes collapses into one run, so a full
 * library scan cannot fire once per thumbnail write.
 *
 * A promise-returning callback is serialized: a trigger that lands while the
 * scan is still settling marks one trailing run, which waits out the remainder
 * of the window instead of firing on settle.
 */
export function useCoalescedCallback(
  callback: () => void | Promise<void>,
  trigger: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const lastRunAt = useRef(0);
  const inFlight = useRef(false);
  const trailing = useRef(false);
  // The one pending wake-up, whether leading or trailing: a fresh schedule
  // always supersedes the previous one, so overlapping timers can never stack
  // a phantom run behind the scan they both owe.
  const pendingTimer = useRef<number | null>(null);

  useEffect(() => {
    const schedule = (wait: number): void => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current);
      }
      pendingTimer.current = window.setTimeout(() => {
        pendingTimer.current = null;
        void run();
      }, wait);
    };

    const run = async (): Promise<void> => {
      if (inFlight.current) {
        trailing.current = true;
        return;
      }
      lastRunAt.current = Date.now();
      const result = callback();
      if (!result || typeof result.then !== "function") {
        return;
      }
      inFlight.current = true;
      try {
        await result;
      } finally {
        inFlight.current = false;
        if (trailing.current) {
          trailing.current = false;
          schedule(Math.max(0, lastRunAt.current + windowMs - Date.now()));
        }
      }
    };

    schedule(Math.max(0, lastRunAt.current + windowMs - Date.now()));
    return () => {
      if (pendingTimer.current !== null) {
        window.clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
    };
  }, [callback, trigger, windowMs]);
}
