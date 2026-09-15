/**
 * Per-page drag-to-place layer for "create" mode. Uses FormFieldOverlay's scale
 * basis (pageWidthPx / pdfPage.size.width) so placements round-trip on reload.
 */
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import { pendingSelectionName } from "@app/tools/formFill/pendingSelection";
import type { CreatableFieldType } from "@app/tools/formFill/types";
import {
  pixelsToBackendRect,
  backendRectToPixels,
  clampPixelRect,
  roundPdfRect,
  type PixelRect,
} from "@app/tools/formFill/formCoordinateUtils";
import {
  collectSnapTargets,
  snapMove,
  type SnapGuide,
} from "@app/tools/formFill/formSnapUtils";
import {
  usePageScale,
  getLocalPoint,
  isTextEntryTarget,
} from "@app/tools/formFill/usePageScale";
import { SnapGuides } from "@app/tools/formFill/SnapGuides";
import { FORM_COLORS } from "@app/tools/formFill/formFieldColors";

interface FormFieldCreationOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  fileId?: string | null;
}

/** Minimum drawn size (pixels) below which we treat the gesture as a click. */
const MIN_DRAG_PX = 5;

/** Default field size in PDF points, used for click-to-place. */
const DEFAULT_SIZE_PTS: Record<CreatableFieldType, { w: number; h: number }> = {
  text: { w: 150, h: 24 },
  checkbox: { w: 16, h: 16 },
  combobox: { w: 150, h: 24 },
  listbox: { w: 150, h: 64 },
  radio: { w: 16, h: 16 },
  button: { w: 120, h: 28 },
  signature: { w: 200, h: 60 },
};

export function FormFieldCreationOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
  fileId,
}: FormFieldCreationOverlayProps) {
  const {
    mode,
    creationType,
    setCreationType,
    pendingFields,
    addPendingField,
    selectedFieldName,
    setSelectedField,
    previewing,
    state,
    forFileId,
  } = useFormFill();

  const rootRef = useRef<HTMLDivElement>(null);
  const [dragRect, setDragRect] = useState<PixelRect | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const { scaleX, scaleY, pageHeightPts, pageWidthPts, rotation } =
    usePageScale(documentId, pageIndex, pageWidth, pageHeight);

  // Pixel rects of the OTHER fields on this page, used as snap targets.
  const snapRects = useMemo<PixelRect[]>(() => {
    const rects: PixelRect[] = [];
    for (const field of state.fields) {
      for (const w of field.widgets ?? []) {
        if (w.pageIndex !== pageIndex) continue;
        rects.push({
          left: w.x * scaleX,
          top: w.y * scaleY,
          width: w.width * scaleX,
          height: w.height * scaleY,
        });
      }
    }
    for (const pf of pendingFields) {
      if (pf.pageIndex !== pageIndex) continue;
      rects.push(backendRectToPixels(pf, scaleX, scaleY, pageHeightPts));
    }
    return rects;
  }, [state.fields, pendingFields, pageIndex, scaleX, scaleY, pageHeightPts]);

  // Precompute snap edges once (not on every pointermove).
  const snapTargets = useMemo(() => collectSnapTargets(snapRects), [snapRects]);

  const active = mode === "create" && creationType != null && !previewing;

  // Stale-file guard: don't draw on a page whose fields belong to another file.
  const fileMismatch =
    fileId != null && forFileId != null && fileId !== forFileId;

  // Whether this gesture began with something selected; see handlePointerDown.
  const startedSelectedRef = useRef(false);

  const localPoint = useCallback(
    (e: React.PointerEvent) => getLocalPoint(e, rootRef.current, rotation),
    [rotation],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      // Before the bare-overlay check: a press on a pending outline must not select text either.
      e.preventDefault();
      // Only start a drag on the bare overlay, never on a pending outline.
      if (e.target !== rootRef.current) return;
      // A click away from a selection means "deselect"; a drag always means "draw". Which one
      // this is cannot be known until the pointer lifts, so start the drag either way.
      startedSelectedRef.current = Boolean(selectedFieldName);
      rootRef.current?.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      dragStartRef.current = p;
      setDragRect({ left: p.x, top: p.y, width: 0, height: 0 });
    },
    [active, localPoint, selectedFieldName, setSelectedField],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active || !dragStartRef.current) return;
      const p = localPoint(e);
      const start = dragStartRef.current;
      let rect: PixelRect = {
        left: Math.min(start.x, p.x),
        top: Math.min(start.y, p.y),
        width: Math.abs(p.x - start.x),
        height: Math.abs(p.y - start.y),
      };
      const snapped = snapMove(rect, snapTargets, 6);
      rect = { ...rect, left: snapped.left, top: snapped.top };
      setGuides(snapped.guides);
      setDragRect(rect);
    },
    [active, localPoint, snapTargets],
  );

  // A cancelled gesture (system swipe, focus loss) must not leave a half-drawn rect behind.
  const cancelDrag = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = null;
    startedSelectedRef.current = false;
    setDragRect(null);
    setGuides([]);
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer capture may already be released */
    }
  }, []);

  const finishDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!active || !dragStartRef.current || !creationType) return;
      const start = dragStartRef.current;
      dragStartRef.current = null;
      setGuides([]);
      try {
        rootRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture may already be released */
      }

      const current = dragRect;
      setDragRect(null);
      if (!current) return;

      const dragged =
        // Either axis is enough: requiring both threw away a deliberate thin drag, such as a
        // signature line, and replaced it with a default box centred on the press point.
        Math.max(current.width, current.height) >= MIN_DRAG_PX;

      // A click that went nowhere only clears the selection it started with.
      if (!dragged && startedSelectedRef.current) {
        startedSelectedRef.current = false;
        setSelectedField(null);
        return;
      }
      startedSelectedRef.current = false;

      let pixelRect: PixelRect;
      if (dragged) {
        pixelRect = current;
      } else {
        // Click-to-place: default size centred on the click point.
        const def = DEFAULT_SIZE_PTS[creationType];
        const wPx = def.w * scaleX;
        const hPx = def.h * scaleY;
        pixelRect = {
          left: start.x - wPx / 2,
          top: start.y - hPx / 2,
          width: wPx,
          height: hPx,
        };
      }

      pixelRect = clampPixelRect(pixelRect, pageWidth, pageHeight);
      const pdf = roundPdfRect(
        pixelsToBackendRect(pixelRect, scaleX, scaleY, pageHeightPts),
      );

      const id = addPendingField({
        type: creationType,
        pageIndex,
        x: pdf.x,
        y: pdf.y,
        width: pdf.width,
        height: pdf.height,
      });
      // Selected the moment it lands, so it can be nudged or resized without another click.
      setSelectedField(pendingSelectionName(id));
    },
    [
      active,
      creationType,
      dragRect,
      scaleX,
      scaleY,
      pageHeightPts,
      pageWidth,
      pageHeight,
      pageIndex,
      addPendingField,
      setSelectedField,
    ],
  );

  // Escape disarms placement / cancels the in-progress drag.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntryTarget(e.target)) return;
      if (e.key === "Escape") {
        dragStartRef.current = null;
        setDragRect(null);
        setGuides([]);
        setCreationType(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setCreationType]);

  if (mode !== "create" || fileMismatch || !pageWidthPts) return null;

  return (
    <div
      ref={rootRef}
      data-testid={`form-create-overlay-${pageIndex}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: active ? "auto" : "none",
        // Without this the browser claims the gesture as a pan and drags never start on touch.
        touchAction: active ? "none" : "auto",
        // Crosshair means the next click draws; the arrow means it clears the selection.
        cursor: !active
          ? "default"
          : selectedFieldName
            ? "default"
            : "crosshair",
        userSelect: "none",
        WebkitUserSelect: "none",
        zIndex: 5,
      }}
    >
      {/* Queued fields are drawn by FormFieldEditOverlay, which also moves and resizes
          them; drawing them here too would show two boxes and leave one behind on drag. */}
      {/* Live drag preview */}
      {dragRect && creationType && (
        <div
          style={{
            position: "absolute",
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
            border: `2px dashed ${FORM_COLORS.accent}`,
            background: FORM_COLORS.accentFill,
            pointerEvents: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Alignment guides */}
      <SnapGuides guides={guides} />
    </div>
  );
}

export default FormFieldCreationOverlay;
