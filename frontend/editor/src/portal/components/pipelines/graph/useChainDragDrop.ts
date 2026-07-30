import { useCallback, useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { reorderTarget } from "@portal/components/pipelines/graph/pipelineLayout";

/**
 * Drag-to-reorder for the pipeline chain.
 *
 * The chain is a sequence, so a step's meaningful move is "somewhere else in the order" - which
 * makes the *wires* the drop targets, not the nodes. Each wire already knows the slot it opens
 * (see layoutChain), so a drop is one call to reorder with that slot; there is no midpoint
 * arithmetic or above/below bookkeeping, and no free coordinates to store.
 */

const DRAG_TYPE = "pipeline-step";

interface StepDragData extends Record<string, unknown> {
  type: typeof DRAG_TYPE;
  fromIndex: number;
}

function isStepDrag(data: Record<string, unknown>): data is StepDragData {
  return data.type === DRAG_TYPE && typeof data.fromIndex === "number";
}

export interface UseStepDraggableOptions {
  index: number;
  /** Told when this step's drag starts and ends, so the graph can light up the wires. */
  onDragChange: (dragging: boolean) => void;
}

export interface UseStepDraggableResult {
  ref: React.RefObject<HTMLDivElement | null>;
  /**
   * Wraps the node's click so the click that can trail a drag does not also select. Native drag
   * usually swallows it, but the page editor carries the same guard - cheap insurance.
   */
  guardClick: (action: () => void) => () => void;
}

/** Makes one step node draggable, tagged with the chain position it started from. */
export function useStepDraggable({
  index,
  onDragChange,
}: UseStepDraggableOptions): UseStepDraggableResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const draggedRef = useRef(false);

  // Read through refs so a reorder (which renumbers every later step) never re-registers the
  // adapter mid-gesture.
  const indexRef = useRef(index);
  indexRef.current = index;
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return draggable({
      element,
      getInitialData: (): StepDragData => ({
        type: DRAG_TYPE,
        fromIndex: indexRef.current,
      }),
      onDragStart: () => {
        draggedRef.current = true;
        onDragChangeRef.current(true);
      },
      onDrop: () => onDragChangeRef.current(false),
    });
  }, []);

  const guardClick = useCallback(
    (action: () => void) => () => {
      if (draggedRef.current) {
        draggedRef.current = false;
        return;
      }
      action();
    },
    [],
  );

  return { ref, guardClick };
}

export interface UseEdgeDropOptions {
  /** The slot this wire opens; null for the wires either side of the empty-chain placeholder. */
  insertIndex: number | null;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export interface UseEdgeDropResult {
  ref: React.RefObject<HTMLDivElement | null>;
  /** A step is hovering this wire and would land here. */
  over: boolean;
}

/** Makes one wire a drop target that moves the dropped step into the slot the wire opens. */
export function useEdgeDrop({
  insertIndex,
  onReorder,
}: UseEdgeDropOptions): UseEdgeDropResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);

  const insertIndexRef = useRef(insertIndex);
  insertIndexRef.current = insertIndex;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      // A wire with no slot is not a target at all, so a step dragged over it shows no landing spot.
      canDrop: ({ source }) =>
        insertIndexRef.current !== null && isStepDrag(source.data),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        const slot = insertIndexRef.current;
        if (slot === null || !isStepDrag(source.data)) return;
        const target = reorderTarget(source.data.fromIndex, slot);
        if (target !== null)
          onReorderRef.current(source.data.fromIndex, target);
      },
    });
  }, []);

  return { ref, over };
}
