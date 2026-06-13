/**
 * FormFieldCreationOverlay — drag-to-place layer for "create" mode.
 *
 * Mounted per page alongside FormFieldOverlay. When a field type is armed in
 * the create panel, dragging on the page draws a rectangle which becomes a
 * pending field. A plain click (no drag) drops a default-sized field. Pending
 * fields on this page are drawn as dashed outlines; alignment guides appear
 * while dragging.
 *
 * Coordinates use the exact same scale basis as FormFieldOverlay
 * (pageWidthPx / pdfPage.size.width), so a field placed at a pixel position
 * round-trips back to the same position after save/reload.
 */
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useDocumentState } from "@embedpdf/core/react";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
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

const TYPE_COLOR: Record<CreatableFieldType, string> = {
  text: "#3b82f6",
  checkbox: "#10b981",
  combobox: "#8b5cf6",
  listbox: "#f59e0b",
  radio: "#0ea5e9",
  button: "#f97316",
  signature: "#6366f1",
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
    state,
    forFileId,
  } = useFormFill();

  const documentState = useDocumentState(documentId);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragRect, setDragRect] = useState<PixelRect | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const { scaleX, scaleY, pageHeightPts, pageWidthPts } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage?.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return { scaleX: s, scaleY: s, pageHeightPts: 0, pageWidthPts: 0 };
    }
    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
      pageHeightPts: pdfPage.size.height,
      pageWidthPts: pdfPage.size.width,
    };
  }, [documentState, pageIndex, pageWidth, pageHeight]);

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

  const active = mode === "create" && creationType != null;

  // Stale-file guard: don't draw on a page whose fields belong to another file.
  const fileMismatch =
    fileId != null && forFileId != null && fileId !== forFileId;

  const localPoint = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      // Only start a drag on the bare overlay, never on a pending outline.
      if (e.target !== rootRef.current) return;
      e.preventDefault();
      rootRef.current?.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      dragStartRef.current = p;
      setDragRect({ left: p.x, top: p.y, width: 0, height: 0 });
    },
    [active, localPoint],
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
        current.width >= MIN_DRAG_PX && current.height >= MIN_DRAG_PX;

      let pixelRect: PixelRect;
      if (dragged) {
        pixelRect = current;
      } else {
        // Click-to-place: default size centred on the click point.
        const def = DEFAULT_SIZE_PTS[creationType];
        const wPx = def.w * scaleX;
        const hPx = def.h * scaleY;
        pixelRect = {
          left: start.x,
          top: start.y,
          width: wPx,
          height: hPx,
        };
      }

      pixelRect = clampPixelRect(pixelRect, pageWidth, pageHeight);
      const pdf = roundPdfRect(
        pixelsToBackendRect(pixelRect, scaleX, scaleY, pageHeightPts),
      );

      addPendingField({
        type: creationType,
        pageIndex,
        x: pdf.x,
        y: pdf.y,
        width: pdf.width,
        height: pdf.height,
      });
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
    ],
  );

  // Escape disarms placement / cancels the in-progress drag.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
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

  const pendingOnPage = pendingFields.filter((p) => p.pageIndex === pageIndex);

  return (
    <div
      ref={rootRef}
      data-testid={`form-create-overlay-${pageIndex}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
        zIndex: 5,
      }}
    >
      {/* Already-queued fields on this page */}
      {pendingOnPage.map((pf) => {
        const r = backendRectToPixels(pf, scaleX, scaleY, pageHeightPts);
        const color = TYPE_COLOR[pf.type];
        return (
          <div
            key={pf.id}
            style={{
              position: "absolute",
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              border: `1.5px dashed ${color}`,
              background: `${color}1a`,
              borderRadius: 2,
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -16,
                left: 0,
                fontSize: 10,
                lineHeight: "14px",
                padding: "0 4px",
                background: color,
                color: "#fff",
                borderRadius: 2,
                whiteSpace: "nowrap",
              }}
            >
              {pf.name}
            </span>
          </div>
        );
      })}

      {/* Live drag preview */}
      {dragRect && creationType && (
        <div
          style={{
            position: "absolute",
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
            border: `2px dashed ${TYPE_COLOR[creationType]}`,
            background: `${TYPE_COLOR[creationType]}22`,
            pointerEvents: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* Alignment guides */}
      {guides.map((g, i) => (
        <div
          key={i}
          style={
            g.orientation === "v"
              ? {
                  position: "absolute",
                  left: g.position,
                  top: 0,
                  width: 1,
                  height: "100%",
                  background: "#ec4899",
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  top: g.position,
                  left: 0,
                  height: 1,
                  width: "100%",
                  background: "#ec4899",
                  pointerEvents: "none",
                }
          }
        />
      ))}
    </div>
  );
}

export default FormFieldCreationOverlay;
