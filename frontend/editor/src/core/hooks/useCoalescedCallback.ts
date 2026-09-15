import { useEffect, useRef } from "react";

const DEFAULT_WINDOW_MS = 300;

/**
 * Runs `callback` at most once per `windowMs`, trailing, and immediately on the
 * first trigger. A burst of `trigger` changes collapses into one run, so a full
 * library scan cannot fire once per thumbnail write.
 */
export function useCoalescedCallback(
  callback: () => void,
  trigger: unknown,
  windowMs: number = DEFAULT_WINDOW_MS,
): void {
  const lastRunAt = useRef(0);

  useEffect(() => {
    const wait = Math.max(0, lastRunAt.current + windowMs - Date.now());
    const timer = window.setTimeout(() => {
      lastRunAt.current = Date.now();
      callback();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [callback, trigger, windowMs]);
}
