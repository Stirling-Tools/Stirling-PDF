import { useCallback, useRef } from "react";

/** Clicks needed, and the window they must all land inside. */
const CLICKS_REQUIRED = 7;
const WINDOW_MS = 3000;

/**
 * Counts rapid repeat clicks on a control without changing what that control
 * does — every click still runs the host's own handler, and only the last one
 * of a fast burst also unlocks. Deliberate impatience is the signal: seven
 * clicks in three seconds is not something a normal user produces by accident.
 *
 * The payload from the unlocking click is handed on, so a caller can pass
 * through something only the event knows (such as the trigger's own rect).
 */
export function useSecretClicks<T>(
  onUnlock: (payload: T) => void,
): (payload: T) => void {
  const times = useRef<number[]>([]);

  return useCallback(
    (payload: T) => {
      const now = Date.now();
      const recent = times.current.filter((t) => now - t <= WINDOW_MS);
      recent.push(now);
      if (recent.length >= CLICKS_REQUIRED) {
        times.current = [];
        onUnlock(payload);
        return;
      }
      times.current = recent;
    },
    [onUnlock],
  );
}
