import { useEffect, useRef } from "react";

const DEFAULT_WINDOW_MS = 300;

/**
 * Runs `callback` at most once per `windowMs`, trailing, and immediately on the
 * first trigger. A burst of `trigger` changes collapses into one run, so a full
 * library scan cannot fire once per thumbnail write.
 *
 * A promise-returning callback is serialized: a trigger that lands while the
 * scan is still settling marks one trailing run instead of starting a second.
 */
export function useCoalescedCallback(
  callback: () => void | Promise<void>,
  trigger: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const lastRunAt = useRef(0);
  const inFlight = useRef(false);
  const trailing = useRef(false);

  useEffect(() => {
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
          void run();
        }
      }
    };

    const wait = Math.max(0, lastRunAt.current + windowMs - Date.now());
    const timer = window.setTimeout(() => {
      void run();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [callback, trigger, windowMs]);
}
