import { useState } from "react";
import React from "react";
import { Rnd } from "react-rnd";
import type {
  ImageObjectSnapshot,
  PageRect,
} from "@app/tools/pdfTextEditor/v2/types";

interface ImageHandleProps {
  image: ImageObjectSnapshot;
  pageHeight: number;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onTransformCommit: (next: PageRect) => void;
}

/**
 * Draggable + resizable affordance for an image object.
 *
 * Both drag and resize report their final state (position + size) via a
 * single `onTransformCommit` so the editor can dispatch one absolute-
 * matrix command per gesture, sidestepping the post-multiply drift that
 * caused the original teleport bug.
 */
export function ImageHandle({
  image,
  pageHeight,
  scale,
  selected,
  onSelect,
  onTransformCommit,
}: ImageHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const left = image.bounds.x * scale;
  const top = (pageHeight - image.bounds.y - image.bounds.height) * scale;
  const width = Math.max(8, image.bounds.width * scale);
  const height = Math.max(8, image.bounds.height * scale);

  function cssToPdfBounds(
    leftCss: number,
    topCss: number,
    widthCss: number,
    heightCss: number,
  ): PageRect {
    const w = Math.max(1, widthCss / scale);
    const h = Math.max(1, heightCss / scale);
    const x = leftCss / scale;
    // CSS y grows downward, PDF y upward. CSS top corresponds to the
    // image's PDF top edge = bounds.y + bounds.height.
    const y = pageHeight - topCss / scale - h;
    return { x, y, width: w, height: h };
  }

  // Locked images are inert: no select, drag, or resize. The PDFium bitmap
  // still paints them so the user sees what's there; the editor just refuses
  // to act on them (mirrors TextRunOverlay's locked behaviour).
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
