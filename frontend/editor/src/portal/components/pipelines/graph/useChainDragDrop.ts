import { useCallback, useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import {
  NODE_WIDTH,
  reorderMany,
} from "@portal/components/pipelines/graph/pipelineLayout";

/**
 * Drag-to-reorder for the pipeline chain.
 *
 * The chain is a sequence, so a step's meaningful move is "somewhere else in the order" - which
 * makes the *wires* the drop targets, not the nodes. Each wire already knows the slot it opens
 * (see layoutChain), so a drop is one call to reorderMany with that slot; there is no midpoint
 * arithmetic or above/below bookkeeping, and no free coordinates to store.
 */

const DRAG_TYPE = "pipeline-step";

interface StepDragData extends Record<string, unknown> {
  type: typeof DRAG_TYPE;
  /** Every step this drag carries, in chain order - one, or the whole selection. */
  moving: number[];
}

function isStepDrag(data: Record<string, unknown>): data is StepDragData {
  return data.type === DRAG_TYPE && Array.isArray(data.moving);
}

export interface UseStepDraggableOptions {
  /**
   * The steps this node's drag should carry: the current selection when this node is part of it,
   * otherwise just itself. Resolved by the graph, which is what knows the selection.
   */
  moving: number[];
  /** Told when this step's drag starts and ends, so the graph can light up the wires. */
  onDragChange: (dragging: boolean) => void;
}

export interface UseStepDraggableResult {
  ref: React.RefObject<HTMLDivElement | null>;
  /**
   * Wraps the node's click so the click that can trail a drag does not also select. Native drag
   * usually swallows it, but the page editor carries the same guard - cheap insurance.
   */
  guardClick: <E>(action: (event: E) => void) => (event: E) => void;
}

/**
 * Stack a copy of every dragged card into the preview container, so a multi-step drag shows what is
 * actually moving rather than only the card that was grabbed. Exported for testing; the cards are
 * found in the DOM by their chain position.
 */
export function fillDragPreview(
  container: HTMLElement,
  moving: readonly number[],
): void {
  container.className = "portal-graph__drag-preview";
  container.style.width = `${NODE_WIDTH}px`;
  for (const index of moving) {
    const card = document.querySelector(`[data-step-index="${index}"]`);
    if (!card) continue;
    const copy = card.cloneNode(true) as HTMLElement;
    // The originals dim once the drag starts; the copies are the drag, so they stay solid.
    copy.classList.remove("is-dragging");
    container.appendChild(copy);
  }
}

/** Makes one step node draggable, tagged with the chain position it started from. */
export function useStepDraggable({
  moving,
  onDragChange,
}: UseStepDraggableOptions): UseStepDraggableResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const draggedRef = useRef(false);

  // Read through refs so a reorder (which renumbers every later step) never re-registers the
  // adapter mid-gesture.
  const movingRef = useRef(moving);
  movingRef.current = moving;
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return draggable({
      element,
      getInitialData: (): StepDragData => ({
        type: DRAG_TYPE,
        moving: movingRef.current,
      }),
      onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
        const moving = movingRef.current;
        // One step drags as itself; the browser's own preview of the grabbed card is right. A set
        // needs to show what is actually moving, so the preview stacks a copy of every card.
        if (moving.length < 2) return;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: preserveOffsetOnSource({
            element,
            input: location.current.input,
          }),
          render: ({ container }) => fillDragPreview(container, moving),
        });
      },
      onDragStart: () => {
        draggedRef.current = true;
        onDragChangeRef.current(true);
      },
      onDrop: () => onDragChangeRef.current(false),
    });
  }, []);

  const guardClick = useCallback(
    <E>(action: (event: E) => void) =>
      (event: E) => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        action(event);
      },
    [],
  );

  return { ref, guardClick };
}

export interface UseEdgeDropOptions {
  /** The slot this wire opens; null for the wires either side of the empty-chain placeholder. */
  insertIndex: number | null;
  stepCount: number;
  /** Given the chain's new order as original step indices. */
  onReorder: (order: number[]) => void;
}

export interface UseEdgeDropResult {
  ref: React.RefObject<HTMLDivElement | null>;
  /** A step is hovering this wire and would land here. */
  over: boolean;
}

/** Makes one wire a drop target that moves the dropped step into the slot the wire opens. */
export function useEdgeDrop({
  insertIndex,
  stepCount,
  onReorder,
}: UseEdgeDropOptions): UseEdgeDropResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);

  const insertIndexRef = useRef(insertIndex);
  insertIndexRef.current = insertIndex;
  const stepCountRef = useRef(stepCount);
  stepCountRef.current = stepCount;
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
        const order = reorderMany(
          stepCountRef.current,
          source.data.moving,
          slot,
        );
        if (order !== null) onReorderRef.current(order);
      },
    });
  }, []);

  return { ref, over };
}
