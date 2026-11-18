import { useEffect, useRef, useState } from "react";
import React from "react";
import { Rnd, type RndDragEvent } from "react-rnd";
import { AttentionBadge } from "@editor/tools/pdfTextEditor/components/AttentionBadge";
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

interface DragOrigin {
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
  maxLeft: number;
  maxTop: number;
}

function pointerOf(e: RndDragEvent): { x: number; y: number } | null {
  if ("changedTouches" in e) {
    const touch = e.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: e.clientX, y: e.clientY };
}

// react-draggable adds each move to the position it last rendered, so moves
// that arrive before React commits the one before them are lost and the box
// trails the pointer. Firefox and WebKit deliver several per frame, so the
// box is placed from the pointer's travel since the press instead.
function draggedTo(
  origin: DragOrigin | null,
  e: RndDragEvent,
): { x: number; y: number } | null {
  const pointer = pointerOf(e);
  if (!origin || !pointer) return null;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    x: clamp(origin.left + pointer.x - origin.pointerX, origin.maxLeft),
    y: clamp(origin.top + pointer.y - origin.pointerY, origin.maxTop),
  };
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
  /** Paints the page as it is without the image, for the length of a gesture. */
  onLift?: () => void;
  /**
   * Ends the gesture onLift began. Returns true when the page will repaint
   * with the change; otherwise the image is already painted back.
   */
  onSettle?: (committed: boolean) => boolean;
  /** The page revision the canvas shows. */
  pageRevision?: number;
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
  onLift,
  onSettle,
  pageRevision = -1,
}: ImageHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Shift during a corner drag keeps the proportions, as in Acrobat. Read
  // from every resize event, so pressing or releasing it mid-drag applies.
  const [keepRatio, setKeepRatio] = useState(false);
  const [ghost, setGhost] = useState<ImagePixels | null>(null);
  const dragOriginRef = useRef<DragOrigin | null>(null);
  const [dragPosition, setDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const liftedRef = useRef(false);
  const cancelledRef = useRef(false);
  const escapeRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  // The painted revision a committed gesture waits to see replaced: the
  // picture stays on the moving box until the page draws it in place.
  const awaitingPaintRef = useRef<number | null>(null);
  const settleRef = useRef(onSettle);
  settleRef.current = onSettle;

  useEffect(() => {
    if (awaitingPaintRef.current === null) return;
    if (pageRevision === awaitingPaintRef.current) return;
    awaitingPaintRef.current = null;
    setGhost(null);
  }, [pageRevision]);

  useEffect(
    () => () => {
      if (escapeRef.current)
        window.removeEventListener("keydown", escapeRef.current);
      if (liftedRef.current) settleRef.current?.(false);
    },
    [],
  );

  // A raw-PDF AABB as CSS px on the page: 4 corners through the display
  // transform, then min/max.
  function cssRect(r: PageRect) {
    const corners = [
      transform.apply(r.x, r.y),
      transform.apply(r.x + r.width, r.y),
      transform.apply(r.x, r.y + r.height),
      transform.apply(r.x + r.width, r.y + r.height),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    return {
      left: minX * scale,
      top: (pageHeight - maxY) * scale,
      width: (maxX - minX) * scale,
      height: (maxY - minY) * scale,
    };
  }

  // The box is what shows: a clipped image's hidden part is not the user's to
  // grab.
  const b = visibleImageBounds(image);
  const shown = cssRect(b);
  const left = shown.left;
  const top = shown.top;
  const width = Math.max(8, shown.width);
  const height = Math.max(8, shown.height);

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

  // The whole image placed in the box of what shows, in percent so it keeps
  // its place while a resize stretches the box. The pixels are upright in raw
  // page space, so on a quarter-turned page they are laid out unturned about
  // the image's centre and then turned with the page.
  const full = cssRect(image.bounds);
  const turned = transform.rotate % 2 === 1;
  const ghostWidth = turned ? full.height : full.width;
  const ghostHeight = turned ? full.width : full.height;
  const percent = (part: number, whole: number) =>
    `${(part / Math.max(whole, 1e-6)) * 100}%`;
  const ghostStyle: React.CSSProperties = {
    left: percent(
      full.left + full.width / 2 - ghostWidth / 2 - shown.left,
      shown.width,
    ),
    top: percent(
      full.top + full.height / 2 - ghostHeight / 2 - shown.top,
      shown.height,
    ),
    width: percent(ghostWidth, shown.width),
    height: percent(ghostHeight, shown.height),
    transform: transform.rotate
      ? `rotate(${transform.rotate * 90}deg)`
      : undefined,
  };

  // Shows the picture on the moving box and the page without it beneath.
  // Without readable pixels nothing is lifted: hiding the image behind an
  // empty frame would lose it from view.
  function startLift(): void {
    awaitingPaintRef.current = null;
    cancelledRef.current = false;
    const pixels = readPixels?.() ?? null;
    setGhost(pixels);
    if (!pixels || liftedRef.current) return;
    liftedRef.current = true;
    onLift?.();
    const cancelOnEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !liftedRef.current) return;
      cancelledRef.current = true;
      endLift(false);
    };
    escapeRef.current = cancelOnEscape;
    window.addEventListener("keydown", cancelOnEscape);
  }

  function endLift(committed: boolean): void {
    if (escapeRef.current)
      window.removeEventListener("keydown", escapeRef.current);
    escapeRef.current = null;
    const lifted = liftedRef.current;
    liftedRef.current = false;
    const repaints = lifted && (onSettle?.(committed) ?? false);
    if (repaints) awaitingPaintRef.current = pageRevision;
    else setGhost(null);
  }

  // Commits a gesture's result unless Escape cancelled it.
  function finishGesture(next: PageRect | null): void {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    if (next) onTransformCommit(imageBoundsForVisible(image, next));
    endLift(next !== null);
  }

  // Locked images are inert: no select, drag, or resize.
  const locked = image.locked === true;

  return (
    <Rnd
      size={{ width, height }}
      position={dragPosition ?? { x: left, y: top }}
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
      onDragStart={(e, data) => {
        const pointer = pointerOf(e);
        const parent = data.node.parentElement;
        dragOriginRef.current =
          pointer && parent
            ? {
                pointerX: pointer.x,
                pointerY: pointer.y,
                left,
                top,
                maxLeft: Math.max(0, parent.offsetWidth - width),
                maxTop: Math.max(0, parent.offsetHeight - height),
              }
            : null;
        setDragging(true);
        startLift();
        onSelect();
      }}
      onDrag={(e) => {
        const at = draggedTo(dragOriginRef.current, e);
        if (at) setDragPosition(at);
      }}
      lockAspectRatio={keepRatio}
      onResizeStart={(e) => {
        setKeepRatio(e.shiftKey);
        if (locked) return;
        startLift();
        onSelect();
      }}
      onResize={(e) => setKeepRatio(e.shiftKey)}
      onDragStop={(e, data) => {
        const at = draggedTo(dragOriginRef.current, e) ?? data;
        dragOriginRef.current = null;
        setDragPosition(null);
        setDragging(false);
        // Rnd fixes its bounds when the drag starts, so a scroll mid-drag
        // (Safari scrolls the viewer when the pointer leaves it) can drop the
        // image off the page, where PDFium crops it.
        // An image larger than the page cannot fit, so it is left where it is.
        const page = data.node.parentElement;
        const clamp = (v: number, room: number) =>
          room >= 0 ? Math.min(Math.max(0, v), room) : v;
        const x = page ? clamp(at.x, page.clientWidth - width) : at.x;
        const y = page ? clamp(at.y, page.clientHeight - height) : at.y;
        const next = cssToPdfBounds(x, y, width, height);
        const moved =
          Math.abs(next.x - b.x) > 0.01 || Math.abs(next.y - b.y) > 0.01;
        finishGesture(moved ? next : null);
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        setKeepRatio(false);
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
        finishGesture(changed ? next : null);
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
        <AttentionBadge
          attention={attention}
          testId={`pdf-editor-attention-image-${image.id}`}
          style={{ top: 4, right: 4 }}
        />
      )}
    </Rnd>
  );
}
