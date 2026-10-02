import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ShapeObjectSnapshot } from "@app/tools/pdfTextEditor/types";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";

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
}

/** A hairline rule is a fraction of a pixel tall; this keeps it grabbable. */
const MIN_HIT_PX = 8;
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
}: ShapeHandleProps) {
  const [hovered, setHovered] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const originRef = useRef<{ x: number; y: number } | null>(null);
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
    originRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset({ x: 0, y: 0 });
    const onPointerMove = (ev: PointerEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      setDragOffset({ x: ev.clientX - origin.x, y: ev.clientY - origin.y });
    };
    const endDrag = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", endDrag);
      endDragRef.current = null;
      originRef.current = null;
      setDragOffset(null);
    };
    const onPointerUp = (ev: PointerEvent) => {
      const origin = originRef.current;
      endDrag();
      if (!origin) return;
      const cssDx = ev.clientX - origin.x;
      const cssDy = ev.clientY - origin.y;
      if (Math.hypot(cssDx, cssDy) < DRAG_THRESHOLD_PX) {
        onSelect(false);
        return;
      }
      const v = transform.invertVector(cssDx / scale, -cssDy / scale);
      onMove(v.x, v.y);
    };
    endDragRef.current = endDrag;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", endDrag);
  }

  const dragging = dragOffset !== null;
  return (
    <div
      data-testid={`pdf-editor-shape-${shape.id}`}
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
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
        cursor: dragging ? "grabbing" : "move",
        pointerEvents: "auto",
      }}
    />
  );
}
