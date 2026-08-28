import { useState } from "react";
import React from "react";
import { Rnd } from "react-rnd";
import type {
  ImageObjectSnapshot,
  PageRect,
} from "@app/tools/pdfTextEditor/v2/types";
import type { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

interface ImageHandleProps {
  image: ImageObjectSnapshot;
  pageHeight: number;
  /** Raw-PDF -> display (CropBox/rotation) transform. */
  transform: DisplayTransform;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onTransformCommit: (next: PageRect) => void;
}

/** Draggable + resizable affordance for an image object. */
export function ImageHandle({
  image,
  pageHeight,
  transform,
  scale,
  selected,
  onSelect,
  onTransformCommit,
}: ImageHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Map the image's raw-PDF AABB into display-PDF space (4 corners through the
  // transform, then min/max), then to CSS px.
  const b = image.bounds;
  const dispCorners = [
    transform.apply(b.x, b.y),
    transform.apply(b.x + b.width, b.y),
    transform.apply(b.x, b.y + b.height),
    transform.apply(b.x + b.width, b.y + b.height),
  ];
  const dispMinX = Math.min(...dispCorners.map((c) => c.x));
  const dispMaxX = Math.max(...dispCorners.map((c) => c.x));
  const dispMinY = Math.min(...dispCorners.map((c) => c.y));
  const dispMaxY = Math.max(...dispCorners.map((c) => c.y));
  const left = dispMinX * scale;
  const top = (pageHeight - dispMaxY) * scale;
  const width = Math.max(8, (dispMaxX - dispMinX) * scale);
  const height = Math.max(8, (dispMaxY - dispMinY) * scale);

  function cssToPdfBounds(
    leftCss: number,
    topCss: number,
    widthCss: number,
    heightCss: number,
  ): PageRect {
    // CSS rect -> display-PDF AABB (y-up), then invert each corner back to raw
    // PDF space and re-AABB.
    const dLeft = leftCss / scale;
    const dRight = (leftCss + widthCss) / scale;
    const dTop = pageHeight - topCss / scale;
    const dBottom = pageHeight - (topCss + heightCss) / scale;
    const raw = [
      transform.invert(dLeft, dBottom),
      transform.invert(dRight, dBottom),
      transform.invert(dLeft, dTop),
      transform.invert(dRight, dTop),
    ];
    const minX = Math.min(...raw.map((c) => c.x));
    const maxX = Math.max(...raw.map((c) => c.x));
    const minY = Math.min(...raw.map((c) => c.y));
    const maxY = Math.max(...raw.map((c) => c.y));
    // Derive x/y from the CLAMPED extent (anchored at the far corner) so the
    // identity case reduces byte-exactly to the prior `y = top - clampedHeight`.
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    return { x: maxX - w, y: maxY - h, width: w, height: h };
  }

  // Locked images are inert: no select, drag, or resize.
  const locked = image.locked === true;

  return (
    <Rnd
      size={{ width, height }}
      position={{ x: left, y: top }}
      disableDragging={locked}
      enableResizing={
        !locked && (selected || hovered)
          ? {
              bottomRight: true,
              bottomLeft: true,
              topRight: true,
              topLeft: true,
            }
          : false
      }
      bounds="parent"
      onDragStart={() => {
        setDragging(true);
        onSelect();
      }}
      onResizeStart={() => {
        if (locked) return;
        onSelect();
      }}
      onDragStop={(_, data) => {
        setDragging(false);
        const next = cssToPdfBounds(data.x, data.y, width, height);
        const moved =
          Math.abs(next.x - image.bounds.x) > 0.01 ||
          Math.abs(next.y - image.bounds.y) > 0.01;
        if (!moved) return;
        onTransformCommit(next);
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        const next = cssToPdfBounds(
          position.x,
          position.y,
          ref.offsetWidth,
          ref.offsetHeight,
        );
        const changed =
          Math.abs(next.x - image.bounds.x) > 0.01 ||
          Math.abs(next.y - image.bounds.y) > 0.01 ||
          Math.abs(next.width - image.bounds.width) > 0.01 ||
          Math.abs(next.height - image.bounds.height) > 0.01;
        if (!changed) return;
        onTransformCommit(next);
      }}
      style={{
        outline: selected
          ? "1px solid #2c7be5"
          : hovered || dragging
            ? "1px dashed rgba(0,0,0,0.45)"
            : "none",
        background:
          selected || dragging ? "rgba(44,123,229,0.08)" : "transparent",
        cursor: locked ? "default" : "move",
        // No explicit zIndex - text overlays paint on top via DOM order.
        pointerEvents: "auto",
      }}
      onPointerDown={(e: React.PointerEvent) => {
        // Locked images are inert - the press belongs to the stage.
        if (locked) return;
        // Ctrl/Cmd+Shift+drag is the marquee gesture - let it reach the stage.
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) return;
        // The resize handles are children of this root and sit ~10px outside
        // it, so without this their pointerdown reaches the stage's
        // "empty space clears" handler and deselects mid-resize.
        e.stopPropagation();
        onSelect();
      }}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (locked) return;
        onSelect();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid={`v2-image-${image.id}`}
      data-locked={locked ? "true" : undefined}
    />
  );
}
