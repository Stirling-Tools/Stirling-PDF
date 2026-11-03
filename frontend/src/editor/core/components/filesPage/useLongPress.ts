import { useCallback, useEffect, useRef } from "react";
import type React from "react";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

interface LongPress {
  handlers: Pick<
    React.HTMLAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
  consumeGesture: () => boolean;
}

export function useLongPress(
  onLongPress: () => void,
  enabled: boolean,
): LongPress {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || e.pointerType !== "touch") return;
      cancel();
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        callback.current();
      }, LONG_PRESS_MS);
    },
    [enabled, cancel],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const start = origin.current;
      if (!start) return;
      if (
        Math.abs(e.clientX - start.x) > MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - start.y) > MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    },
    [cancel],
  );

  const consumeGesture = useCallback(() => {
    if (origin.current) return true;
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  if (!enabled) return { handlers: {}, consumeGesture: () => false };
  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
    },
    consumeGesture,
  };
}
