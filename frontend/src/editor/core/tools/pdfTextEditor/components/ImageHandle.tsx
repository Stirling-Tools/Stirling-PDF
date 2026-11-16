import { useEffect, useRef, useState } from "react";
import React from "react";
import { Rnd } from "react-rnd";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { ImageAttention } from "@editor/tools/pdfTextEditor/util/imageAccessibility";
import type {
  ImageObjectSnapshot,
  PageRect,
} from "@editor/tools/pdfTextEditor/types";
import type { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import {
  imageBoundsForVisible,
  visibleImageBounds,
} from "@editor/tools/pdfTextEditor/util/imageClip";
import type { ImagePixels } from "@editor/tools/pdfTextEditor/util/imagePixels";

function ImageGhost({
  pixels,
  style,
}: {
  pixels: ImagePixels;
  style: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(pixels.rgba),
        pixels.width,
        pixels.height,
      ),
      0,
      0,
    );
  }, [pixels]);
  return (
    <canvas
      ref={ref}
      data-testid="pdf-editor-image-ghost"
      style={{ position: "absolute", pointerEvents: "none", ...style }}
    />
  );
}

interface ImageHandleProps {
  image: ImageObjectSnapshot;
  pageHeight: number;
  /** Raw-PDF -> display (CropBox/rotation) transform. */
  transform: DisplayTransform;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onTransformCommit: (next: PageRect) => void;
  /** Why the image needs the user's attention, if it does. */
  attention?: ImageAttention | null;
  /**
   * The image's pixels as the page draws them, filling its bounds, so a drag
   * carries the picture instead of an empty frame. Null when unreadable.
   */
  readPixels?: () => ImagePixels | null;
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
  attention = null,
  readPixels,
}: ImageHandleProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Shift during a corner drag keeps the proportions, as in Acrobat. Read
  // from every resize event, so pressing or releasing it mid-drag applies.
  const [keepRatio, setKeepRatio] = useState(false);
  const [ghost, setGhost] = useState<ImagePixels | null>(null);

  // The box is what shows: a clipped image's hidden part is not the user's to
  // grab. Map its raw-PDF AABB into display-PDF space (4 corners through the
  // transform, then min/max), then to CSS px.
  const b = visibleImageBounds(image);
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

  // A quarter-turned page would need the pixels turned too; the frame alone
  // still shows where the image goes.
  function liftPixels(): ImagePixels | null {
    return transform.rotate === 0 ? (readPixels?.() ?? null) : null;
  }

  // The whole image placed in the box of what shows, in percent so it keeps
  // its place while a resize stretches the box.
  const full = image.bounds;
  const ghostStyle: React.CSSProperties = {
    left: `${((full.x - b.x) / b.width) * 100}%`,
    top: `${((b.y + b.height - (full.y + full.height)) / b.height) * 100}%`,
    width: `${(full.width / b.width) * 100}%`,
    height: `${(full.height / b.height) * 100}%`,
  };

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
        setGhost(liftPixels());
        onSelect();
      }}
      lockAspectRatio={keepRatio}
      onResizeStart={(e) => {
        setKeepRatio(e.shiftKey);
        if (locked) return;
        setGhost(liftPixels());
        onSelect();
      }}
      onResize={(e) => setKeepRatio(e.shiftKey)}
      onDragStop={(_, data) => {
        setDragging(false);
        setGhost(null);
        const next = cssToPdfBounds(data.x, data.y, width, height);
        const moved =
          Math.abs(next.x - b.x) > 0.01 || Math.abs(next.y - b.y) > 0.01;
        if (!moved) return;
        onTransformCommit(imageBoundsForVisible(image, next));
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        setKeepRatio(false);
        setGhost(null);
        const next = cssToPdfBounds(
          position.x,
          position.y,
          ref.offsetWidth,
          ref.offsetHeight,
        );
        const changed =
          Math.abs(next.x - b.x) > 0.01 ||
          Math.abs(next.y - b.y) > 0.01 ||
          Math.abs(next.width - b.width) > 0.01 ||
          Math.abs(next.height - b.height) > 0.01;
        if (!changed) return;
        onTransformCommit(imageBoundsForVisible(image, next));
      }}
      style={{
        outline: selected
          ? "1px solid #2c7be5"
          : hovered || dragging
            ? "1px dashed rgba(0,0,0,0.45)"
            : "none",
        backgroundColor:
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
      data-testid={`pdf-editor-image-${image.id}`}
      data-locked={locked ? "true" : undefined}
    >
      {ghost && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <ImageGhost pixels={ghost} style={ghostStyle} />
        </div>
      )}
      {attention && (
        <Tooltip
          label={
            attention === "needs-description"
              ? t(
                  "pdfTextEditor.inspector.accessibility.needsDescriptionBadge",
                  "No description",
                )
              : t(
                  "pdfTextEditor.inspector.accessibility.untaggedBadge",
                  "Not tagged",
                )
          }
        >
          <span
            data-testid={`pdf-editor-attention-image-${image.id}`}
            data-attention={attention}
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              display: "flex",
              padding: 2,
              borderRadius: "50%",
              background: "var(--c-surface)",
              color: "var(--c-warning)",
              boxShadow: "0 0 0 1px var(--c-border)",
            }}
          >
            <Icon name="circle-alert" size={14} />
          </span>
        </Tooltip>
      )}
    </Rnd>
  );
}
