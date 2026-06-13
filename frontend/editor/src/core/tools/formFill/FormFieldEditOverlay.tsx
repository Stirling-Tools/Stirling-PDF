/**
 * FormFieldEditOverlay — select / move / resize layer for "modify" mode.
 *
 * Mounted per page. Renders every field's widget(s) on the page as an outline.
 * Clicking selects a field (also reflected in the modify panel). The selected
 * field, when it has a single widget, gets drag-to-move and resize handles;
 * geometry changes are staged via stageModification() in CropBox-relative,
 * lower-left-origin points. Fields marked for deletion render struck-through.
 *
 * Uses the same scale basis as FormFieldOverlay so edits round-trip exactly.
 */
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import type { FormField } from "@app/tools/formFill/types";
import {
  pixelsToBackendRect,
  backendRectToPixels,
  widgetRectToPixels,
  clampPixelRect,
  roundPdfRect,
  type PixelRect,
} from "@app/tools/formFill/formCoordinateUtils";
import {
  collectSnapTargets,
  snapMove,
  snapResize,
  type SnapGuide,
} from "@app/tools/formFill/formSnapUtils";
import { usePageScale, getLocalPoint } from "@app/tools/formFill/usePageScale";
import { SnapGuides } from "@app/tools/formFill/SnapGuides";

interface FormFieldEditOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  fileId?: string | null;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: { id: HandleId; cursor: string }[] = [
  { id: "nw", cursor: "nwse-resize" },
  { id: "n", cursor: "ns-resize" },
  { id: "ne", cursor: "nesw-resize" },
  { id: "e", cursor: "ew-resize" },
  { id: "se", cursor: "nwse-resize" },
  { id: "s", cursor: "ns-resize" },
  { id: "sw", cursor: "nesw-resize" },
  { id: "w", cursor: "ew-resize" },
];

const MIN_PX = 8;
const HANDLE_SIZE = 9;

interface Interaction {
  kind: "move" | "resize";
  handle?: HandleId;
  startX: number;
  startY: number;
  startRect: PixelRect;
}

function handleEdges(h: HandleId) {
  return {
    left: h === "nw" || h === "w" || h === "sw",
    right: h === "ne" || h === "e" || h === "se",
    top: h === "nw" || h === "n" || h === "ne",
    bottom: h === "sw" || h === "s" || h === "se",
  };
}

function handlePosition(h: HandleId, rect: PixelRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const map: Record<HandleId, { x: number; y: number }> = {
    nw: { x: rect.left, y: rect.top },
    n: { x: cx, y: rect.top },
    ne: { x: rect.left + rect.width, y: rect.top },
    e: { x: rect.left + rect.width, y: cy },
    se: { x: rect.left + rect.width, y: rect.top + rect.height },
    s: { x: cx, y: rect.top + rect.height },
    sw: { x: rect.left, y: rect.top + rect.height },
    w: { x: rect.left, y: cy },
  };
  return map[h];
}

export function FormFieldEditOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
  fileId,
}: FormFieldEditOverlayProps) {
  const {
    mode,
    state,
    selectedFieldName,
    setSelectedField,
    modifiedFields,
    stageModification,
    deletedFieldNames,
    forFileId,
  } = useFormFill();

  const rootRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [liveRect, setLiveRect] = useState<PixelRect | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const { scaleX, scaleY, pageHeightPts, pageWidthPts } = usePageScale(
    documentId,
    pageIndex,
    pageWidth,
    pageHeight,
  );

  /** First-widget pixel rect for a field on this page, honouring staged geometry. */
  const fieldRect = useCallback(
    (field: FormField): PixelRect | null => {
      const widget = field.widgets?.find((w) => w.pageIndex === pageIndex);
      if (!widget) return null;
      const staged = modifiedFields[field.name];
      if (
        staged &&
        staged.x != null &&
        staged.y != null &&
        staged.width != null &&
        staged.height != null
      ) {
        return backendRectToPixels(
          {
            x: staged.x,
            y: staged.y,
            width: staged.width,
            height: staged.height,
          },
          scaleX,
          scaleY,
          pageHeightPts,
        );
      }
      return widgetRectToPixels(widget, scaleX, scaleY);
    },
    [modifiedFields, pageIndex, scaleX, scaleY, pageHeightPts],
  );

  const fieldsOnPage = useMemo(
    () =>
      state.fields.filter((f) =>
        f.widgets?.some((w) => w.pageIndex === pageIndex),
      ),
    [state.fields, pageIndex],
  );

  const selectedField = useMemo(
    () => fieldsOnPage.find((f) => f.name === selectedFieldName) ?? null,
    [fieldsOnPage, selectedFieldName],
  );

  const selectedSingleWidget =
    !!selectedField && (selectedField.widgets?.length ?? 0) === 1;

  const snapRects = useMemo<PixelRect[]>(() => {
    const rects: PixelRect[] = [];
    for (const f of fieldsOnPage) {
      if (f.name === selectedFieldName) continue;
      const r = fieldRect(f);
      if (r) rects.push(r);
    }
    return rects;
  }, [fieldsOnPage, selectedFieldName, fieldRect]);

  // Precompute snap edges once (not on every pointermove).
  const snapTargets = useMemo(() => collectSnapTargets(snapRects), [snapRects]);

  const localPoint = useCallback(
    (e: React.PointerEvent) => getLocalPoint(e, rootRef.current),
    [],
  );

  const beginInteraction = useCallback(
    (e: React.PointerEvent, kind: "move" | "resize", handle?: HandleId) => {
      if (!selectedField) return;
      const rect = fieldRect(selectedField);
      if (!rect) return;
      e.stopPropagation();
      e.preventDefault();
      rootRef.current?.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      interactionRef.current = {
        kind,
        handle,
        startX: p.x,
        startY: p.y,
        startRect: rect,
      };
      setLiveRect(rect);
    },
    [selectedField, fieldRect, localPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const it = interactionRef.current;
      if (!it) return;
      const p = localPoint(e);
      const dx = p.x - it.startX;
      const dy = p.y - it.startY;
      const targets = snapTargets;

      if (it.kind === "move") {
        let rect: PixelRect = {
          ...it.startRect,
          left: it.startRect.left + dx,
          top: it.startRect.top + dy,
        };
        const snapped = snapMove(rect, targets, 6);
        rect = { ...rect, left: snapped.left, top: snapped.top };
        rect = clampPixelRect(rect, pageWidth, pageHeight);
        setGuides(snapped.guides);
        setLiveRect(rect);
      } else if (it.kind === "resize" && it.handle) {
        const edges = handleEdges(it.handle);
        let { left, top, width, height } = it.startRect;
        if (edges.left) {
          left = it.startRect.left + dx;
          width = it.startRect.width - dx;
        }
        if (edges.right) {
          width = it.startRect.width + dx;
        }
        if (edges.top) {
          top = it.startRect.top + dy;
          height = it.startRect.height - dy;
        }
        if (edges.bottom) {
          height = it.startRect.height + dy;
        }
        // Keep a positive minimum, anchoring the opposite edge.
        if (width < MIN_PX) {
          if (edges.left)
            left = it.startRect.left + it.startRect.width - MIN_PX;
          width = MIN_PX;
        }
        if (height < MIN_PX) {
          if (edges.top) top = it.startRect.top + it.startRect.height - MIN_PX;
          height = MIN_PX;
        }
        let rect: PixelRect = { left, top, width, height };
        const snapped = snapResize(rect, edges, targets, 6);
        rect = snapped.rect;
        setGuides(snapped.guides);
        setLiveRect(rect);
      }
    },
    [localPoint, snapTargets, pageWidth, pageHeight],
  );

  const endInteraction = useCallback(
    (e: React.PointerEvent) => {
      const it = interactionRef.current;
      interactionRef.current = null;
      setGuides([]);
      try {
        rootRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const rect = liveRect;
      setLiveRect(null);
      if (!it || !rect || !selectedField) return;
      const clamped = clampPixelRect(rect, pageWidth, pageHeight);
      const pdf = roundPdfRect(
        pixelsToBackendRect(clamped, scaleX, scaleY, pageHeightPts),
      );
      stageModification(selectedField.name, {
        pageIndex,
        x: pdf.x,
        y: pdf.y,
        width: pdf.width,
        height: pdf.height,
      });
    },
    [
      liveRect,
      selectedField,
      pageWidth,
      pageHeight,
      scaleX,
      scaleY,
      pageHeightPts,
      pageIndex,
      stageModification,
    ],
  );

  // Escape clears the selection; arrow keys nudge the selected field.
  // (Each visible page mounts this overlay, but only the page whose widget
  // matches selectedField resolves a rect, so a nudge applies exactly once.)
  useEffect(() => {
    if (mode !== "modify") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        interactionRef.current = null;
        setLiveRect(null);
        setGuides([]);
        setSelectedField(null);
        return;
      }

      if (
        !selectedField ||
        !selectedSingleWidget ||
        deletedFieldNames.includes(selectedField.name)
      ) {
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }
      const base = fieldRect(selectedField);
      if (!base) return; // selected field's widget isn't on this page
      e.preventDefault();
      const moved = clampPixelRect(
        { ...base, left: base.left + dx, top: base.top + dy },
        pageWidth,
        pageHeight,
      );
      const pdf = roundPdfRect(
        pixelsToBackendRect(moved, scaleX, scaleY, pageHeightPts),
      );
      stageModification(selectedField.name, {
        pageIndex,
        x: pdf.x,
        y: pdf.y,
        width: pdf.width,
        height: pdf.height,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    mode,
    setSelectedField,
    selectedField,
    selectedSingleWidget,
    deletedFieldNames,
    fieldRect,
    pageWidth,
    pageHeight,
    scaleX,
    scaleY,
    pageHeightPts,
    pageIndex,
    stageModification,
  ]);

  const fileMismatch =
    fileId != null && forFileId != null && fileId !== forFileId;
  if (mode !== "modify" || fileMismatch || !pageWidthPts) return null;

  const selectedRect = selectedField
    ? (liveRect ?? fieldRect(selectedField))
    : null;

  return (
    <div
      ref={rootRef}
      data-testid={`form-edit-overlay-${pageIndex}`}
      onPointerDown={() => setSelectedField(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        zIndex: 5,
      }}
    >
      {fieldsOnPage.map((field) => {
        const rect =
          field.name === selectedFieldName && selectedRect
            ? selectedRect
            : fieldRect(field);
        if (!rect) return null;
        const isSelected = field.name === selectedFieldName;
        const isDeleted = deletedFieldNames.includes(field.name);
        return (
          <div
            key={field.name}
            data-testid={`form-edit-field-${field.name}`}
            onPointerDown={(e) => {
              if (isDeleted) return;
              e.stopPropagation();
              if (field.name !== selectedFieldName) {
                setSelectedField(field.name);
                return;
              }
              // Already selected → start a move (single-widget fields only).
              if (selectedSingleWidget) beginInteraction(e, "move");
            }}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              border: isDeleted
                ? "1.5px dashed #ef4444"
                : isSelected
                  ? "2px solid #2563eb"
                  : "1.5px solid rgba(37,99,235,0.5)",
              background: isDeleted
                ? "rgba(239,68,68,0.12)"
                : isSelected
                  ? "rgba(37,99,235,0.10)"
                  : "rgba(37,99,235,0.04)",
              borderRadius: 2,
              boxSizing: "border-box",
              cursor: isDeleted
                ? "not-allowed"
                : isSelected && selectedSingleWidget
                  ? "move"
                  : "pointer",
              textDecoration: isDeleted ? "line-through" : undefined,
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
                background: isDeleted ? "#ef4444" : "#2563eb",
                color: "#fff",
                borderRadius: 2,
                whiteSpace: "nowrap",
                opacity: isSelected || isDeleted ? 1 : 0.7,
              }}
            >
              {field.label || field.name}
            </span>
          </div>
        );
      })}

      {/* Resize handles for the selected single-widget field */}
      {selectedRect &&
        selectedSingleWidget &&
        !deletedFieldNames.includes(selectedFieldName ?? "") &&
        HANDLES.map((h) => {
          const pos = handlePosition(h.id, selectedRect);
          return (
            <div
              key={h.id}
              data-testid={`form-edit-handle-${h.id}`}
              onPointerDown={(e) => beginInteraction(e, "resize", h.id)}
              style={{
                position: "absolute",
                left: pos.x - HANDLE_SIZE / 2,
                top: pos.y - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                background: "#fff",
                border: "1.5px solid #2563eb",
                borderRadius: 2,
                cursor: h.cursor,
                boxSizing: "border-box",
              }}
            />
          );
        })}

      {/* Alignment guides */}
      <SnapGuides guides={guides} />
    </div>
  );
}

export default FormFieldEditOverlay;
