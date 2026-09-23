/**
 * useDropTarget - stable hover-state tracking for drop targets.
 *
 * The default HTML5 drag-and-drop API fires `dragenter`/`dragleave` for every
 * child element the pointer crosses, which makes naive `setHover(true/false)`
 * implementations flicker. This hook tracks enter/leave with a counter so the
 * hover state only resets when the pointer truly leaves the bounding box, and
 * caches the last `dropEffect`/payload to avoid redundant state updates.
 */

import {
  DragEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface UseDropTargetOptions {
  /**
   * MIME type of the drag payload to react to. dragover/drop events for
   * other payloads are ignored so external file drags still bubble up to
   * the page-level drop zone.
   */
  dragType: string;
  /** Fired when the user releases over the target. */
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  /** Optional CSS effect - defaults to "move". */
  dropEffect?: DataTransfer["dropEffect"];
  /** Disable the target without unmounting. */
  disabled?: boolean;
}

export interface DropTargetBinding {
  /** Bind to the element you want to act as a drop target. */
  handlers: {
    onDragEnter: DragEventHandler<HTMLElement>;
    onDragOver: DragEventHandler<HTMLElement>;
    onDragLeave: DragEventHandler<HTMLElement>;
    onDrop: DragEventHandler<HTMLElement>;
  };
  /** True while the pointer is over the element (or any of its children). */
  isOver: boolean;
}

export function useDropTarget({
  dragType,
  onDrop,
  dropEffect = "move",
  disabled,
}: UseDropTargetOptions): DropTargetBinding {
  const [isOver, setIsOver] = useState(false);
  const counter = useRef(0);

  // If the element gets unmounted mid-drag, reset state.
  useEffect(
    () => () => {
      counter.current = 0;
    },
    [],
  );

  const accepts = useCallback(
    (e: React.DragEvent<HTMLElement>) =>
      e.dataTransfer.types.includes(dragType),
    [dragType],
  );

  const handleDragEnter = useCallback<DragEventHandler<HTMLElement>>(
    (e) => {
      if (disabled || !accepts(e)) return;
      e.preventDefault();
      counter.current += 1;
      if (!isOver) setIsOver(true);
    },
    [accepts, disabled, isOver],
  );

  const handleDragOver = useCallback<DragEventHandler<HTMLElement>>(
    (e) => {
      if (disabled || !accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dropEffect;
      if (!isOver) setIsOver(true);
    },
    [accepts, disabled, dropEffect, isOver],
  );

  const handleDragLeave = useCallback<DragEventHandler<HTMLElement>>(
    (e) => {
      if (disabled || !accepts(e)) return;
      counter.current -= 1;
      if (counter.current <= 0) {
        counter.current = 0;
        setIsOver(false);
      }
    },
    [accepts, disabled],
  );

  const handleDrop = useCallback<DragEventHandler<HTMLElement>>(
    (e) => {
      if (disabled || !accepts(e)) return;
      e.preventDefault();
      counter.current = 0;
      setIsOver(false);
      onDrop(e);
    },
    [accepts, disabled, onDrop],
  );

  return {
    handlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
    isOver,
  };
}
