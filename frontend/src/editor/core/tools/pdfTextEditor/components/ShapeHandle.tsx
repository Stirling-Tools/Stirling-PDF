import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { ShapeObjectSnapshot } from "@editor/tools/pdfTextEditor/types";
import type { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";

interface ShapeHandleProps {
  shape: ShapeObjectSnapshot;
  pageHeight: number;
  /** Raw-PDF -> display (CropBox/rotation) transform. */
  transform: DisplayTransform;
  scale: number;
  selected: boolean;
  onSelect: (extend: boolean) => void;
  /** Fires when a drag completes. dx/dy are raw PDF points. */
  onMove: (dx: number, dy: number) => void;
  /** Fires when the corner grip of a shape drawn this session is released; bounds in raw PDF points. */
  onResize?: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

/** A hairline rule is a fraction of a pixel tall; this keeps it grabbable. */
const MIN_HIT_PX = 8;
const RESIZE_GRIP_PX = 10;
/** Below this the press was a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Click-to-select, drag-to-move affordance for a vector shape. */
export function ShapeHandle({
  shape,
  pageHeight,
  transform,
  scale,
  selected,
  onSelect,
  onMove,
  onResize,
}: ShapeHandleProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [grow, setGrow] = useState<{ x: number; y: number } | null>(null);
  // Detaches an in-flight drag's window listeners. A page re-read can unmount
  // the handle mid-drag, and a listener left behind would move a stale shape.
  const endDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => endDragRef.current?.(), []);

  const b = shape.bounds;
  const corners = [
    transform.apply(b.x, b.y),
    transform.apply(b.x + b.width, b.y),
    transform.apply(b.x, b.y + b.height),
    transform.apply(b.x + b.width, b.y + b.height),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const rawWidth = (maxX - minX) * scale;
  const rawHeight = (maxY - minY) * scale;
  const width = Math.max(MIN_HIT_PX, rawWidth);
  const height = Math.max(MIN_HIT_PX, rawHeight);
  const left = minX * scale - (width - rawWidth) / 2;
  const top = (pageHeight - maxY) * scale - (height - rawHeight) / 2;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // One drag at a time: a second finger or pen must not restart it.
    if (endDragRef.current) return;
    // Ctrl/Cmd+Shift+drag is the marquee gesture - let it reach the stage.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
    // Otherwise the stage's "press on empty space clears" handler would drop
    // the selection this press is about to make.
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey) {
      onSelect(true);
      return;
    }
    if (!shape.movable) {
      onSelect(false);
      return;
    }
    followPointer(e, setDragOffset, (dx, dy) => {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        onSelect(false);
        return;
      }
      const v = transform.invertVector(dx / scale, -dy / scale);
      onMove(v.x, v.y);
    });
  }

  // Tracks one pointer, showing its offset from the press as it moves, and
  // hands the final offset in CSS pixels to `release`.
  function followPointer(
    e: React.PointerEvent<HTMLDivElement>,
    show: (offset: { x: number; y: number } | null) => void,
    release: (dx: number, dy: number) => void,
  ) {
    const pointerId = e.pointerId;
    const offsetOf = (ev: { clientX: number; clientY: number }) => ({
      x: ev.clientX - e.clientX,
      y: ev.clientY - e.clientY,
    });
    show({ x: 0, y: 0 });
    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) show(offsetOf(ev));
    };
    const endDrag = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      endDragRef.current = null;
      show(null);
    };
    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) endDrag();
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      endDrag();
      const { x, y } = offsetOf(ev);
      release(x, y);
    };
    endDragRef.current = endDrag;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  const dragging = dragOffset !== null;
  const resizable =
    selected && !!shape.drawn && !!onResize && transform.rotate === 0;

  function onGripDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !onResize || endDragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    followPointer(e, setGrow, (dx, dy) => {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      onResize({
        x: b.x,
        y: b.y - dy / scale,
        width: b.width + dx / scale,
        height: b.height + dy / scale,
      });
    });
  }

  return (
    <div
      data-testid={`pdf-editor-shape-${shape.id}`}
      title={
        shape.movable
          ? undefined
          : t(
              "pdfTextEditor.shape.groupedTitle",
              "Part of a group in this PDF: it can be deleted but not moved.",
            )
      }
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left,
        top,
        width: width + (grow?.x ?? 0),
        height: height + (grow?.y ?? 0),
        transform: dragOffset
          ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
          : undefined,
        outline: selected
          ? "1px solid var(--c-primary)"
          : hovered || dragging
            ? "1px dashed var(--c-border-strong)"
            : "none",
        background:
          selected || dragging ? "var(--c-primary-subtle)" : "transparent",
        opacity: selected || dragging ? 0.6 : 1,
        cursor: !shape.movable ? "pointer" : dragging ? "grabbing" : "move",
        pointerEvents: "auto",
      }}
    >
      {resizable && (
        <div
          role="presentation"
          data-testid={`pdf-editor-shape-resize-${shape.id}`}
          onPointerDown={onGripDown}
          style={{
            position: "absolute",
            right: -RESIZE_GRIP_PX / 2,
            bottom: -RESIZE_GRIP_PX / 2,
            width: RESIZE_GRIP_PX,
            height: RESIZE_GRIP_PX,
            background: "var(--c-surface)",
            border: "1px solid var(--c-primary)",
            borderRadius: 2,
            cursor: "nwse-resize",
          }}
        />
      )}
    </div>
  );
}
