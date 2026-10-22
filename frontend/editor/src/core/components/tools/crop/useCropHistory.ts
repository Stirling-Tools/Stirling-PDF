import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Rectangle } from "@app/utils/cropCoordinates";

const LIMIT = 60;
const EPSILON = 0.2;
const COALESCE_MS = 400;

function same(a: Rectangle, b: Rectangle): boolean {
  return (
    Math.abs(a.x - b.x) < EPSILON &&
    Math.abs(a.y - b.y) < EPSILON &&
    Math.abs(a.width - b.width) < EPSILON &&
    Math.abs(a.height - b.height) < EPSILON
  );
}

export interface CropHistory {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Drop the stack, e.g. when a new document initialises the area. */
  clear: () => void;
}

/**
 * Undo/redo for the crop rectangle. A gesture commits one value, so one drag is
 * one step; keyboard nudges within 400 ms collapse into a single step instead
 * of filling the stack.
 */
export function useCropHistory(
  value: Rectangle,
  onChange: (rect: Rectangle) => void,
): CropHistory {
  const past = useRef<Rectangle[]>([]);
  const future = useRef<Rectangle[]>([]);
  const last = useRef(value);
  const lastRecordedAt = useRef(0);
  const pending = useRef<Rectangle | null>(null);
  const suppress = useRef(false);
  const [, force] = useReducer((tick: number) => tick + 1, 0);

  useEffect(() => {
    if (suppress.current) {
      suppress.current = false;
      last.current = value;
      return;
    }
    if (pending.current && same(pending.current, value)) {
      pending.current = null;
      last.current = value;
      force();
      return;
    }
    if (same(last.current, value)) return;

    const now = Date.now();
    if (now - lastRecordedAt.current > COALESCE_MS) {
      past.current.push(last.current);
      if (past.current.length > LIMIT) past.current.shift();
    }
    lastRecordedAt.current = now;
    future.current = [];
    last.current = value;
    force();
  }, [value]);

  const undo = useCallback(() => {
    const target = past.current.pop();
    if (!target) return;
    future.current.push(last.current);
    pending.current = target;
    last.current = target;
    onChange(target);
    force();
  }, [onChange]);

  const redo = useCallback(() => {
    const target = future.current.pop();
    if (!target) return;
    past.current.push(last.current);
    pending.current = target;
    last.current = target;
    onChange(target);
    force();
  }, [onChange]);

  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    suppress.current = true;
    force();
  }, []);

  return {
    undo,
    redo,
    clear,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
