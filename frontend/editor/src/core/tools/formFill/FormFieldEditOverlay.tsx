/**
 * Per-page select/move/resize layer for "modify" mode. Geometry is staged in
 * CropBox-relative, lower-left-origin points on FormFieldOverlay's scale basis.
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
import {
  usePageScale,
  getLocalPoint,
  isTextEntryTarget,
} from "@app/tools/formFill/usePageScale";
import { SnapGuides } from "@app/tools/formFill/SnapGuides";
import { FORM_COLORS } from "@app/tools/formFill/formFieldColors";

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
  fieldName: string;
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
    dragActiveRef,
  } = useFormFill();

  const rootRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [liveRect, setLiveRect] = useState<PixelRect | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const { scaleX, scaleY, pageHeightPts, pageWidthPts, rotation } =
    usePageScale(documentId, pageIndex, pageWidth, pageHeight);

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
    (e: React.PointerEvent) => getLocalPoint(e, rootRef.current, rotation),
    [rotation],
  );

  const beginInteraction = useCallback(
    (
      e: React.PointerEvent,
      field: FormField,
      kind: "move" | "resize",
      handle?: HandleId,
    ) => {
      const rect = fieldRect(field);
      if (!rect) return;
      e.stopPropagation();
      e.preventDefault();
      rootRef.current?.setPointerCapture(e.pointerId);
      dragActiveRef.current = true;
      const p = localPoint(e);
      interactionRef.current = {
        kind,
        handle,
        fieldName: field.name,
        startX: p.x,
        startY: p.y,
        startRect: rect,
      };
      setLiveRect(rect);
    },
    [fieldRect, localPoint],
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

  // Scrolling this page out of view mid-gesture would otherwise strand the shared
  // flag at true and leave Escape dead in the panel for the rest of the session.
  useEffect(
    () => () => {
      dragActiveRef.current = false;
    },
    [dragActiveRef],
  );

  // A cancelled gesture (system swipe, focus loss) must not leave a half-applied drag behind.
  const cancelInteraction = useCallback(
    (e: React.PointerEvent) => {
      interactionRef.current = null;
      dragActiveRef.current = false;
      setGuides([]);
      setLiveRect(null);
      try {
        rootRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [setGuides, setLiveRect],
  );

  const endInteraction = useCallback(
    (e: React.PointerEvent) => {
      const it = interactionRef.current;
      interactionRef.current = null;
      dragActiveRef.current = false;
      setGuides([]);
      try {
        rootRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const rect = liveRect;
      setLiveRect(null);
      if (!it || !rect) return;
      // A plain click produces no movement; staging it would mark the field dirty.
      const moved =
        Math.abs(rect.left - it.startRect.left) > 0.5 ||
        Math.abs(rect.top - it.startRect.top) > 0.5 ||
        Math.abs(rect.width - it.startRect.width) > 0.5 ||
        Math.abs(rect.height - it.startRect.height) > 0.5;
      if (!moved) return;
      const clamped = clampPixelRect(rect, pageWidth, pageHeight);
      const pdf = roundPdfRect(
        pixelsToBackendRect(clamped, scaleX, scaleY, pageHeightPts),
      );
      stageModification(it.fieldName, {
        pageIndex,
        x: pdf.x,
        y: pdf.y,
        width: pdf.width,
        height: pdf.height,
      });
    },
    [
      liveRect,
      pageWidth,
      pageHeight,
      scaleX,
      scaleY,
      pageHeightPts,
      pageIndex,
      stageModification,
    ],
  );

  // Arrow keys nudge the selected field; Escape cancels an in-progress drag.
  // Every mounted overlay listens, but only the selection's page acts (fieldRect is null elsewhere).
  useEffect(() => {
    if (mode !== "modify" || !selectedField) return;
    const onKey = (e: KeyboardEvent) => {
      // Read only: every page's overlay runs this, so writing the shared flag here
      // would let an idle page clear the flag of the page actually being dragged.
      const dragging = interactionRef.current != null;
      if (!dragging && isTextEntryTarget(e.target)) return;
      if (e.key === "Escape") {
        interactionRef.current = null;
        dragActiveRef.current = false;
        setLiveRect(null);
        setGuides([]);
        if (!dragging) setSelectedField(null);
        return;
      }
      if (dragging) return;

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
      onPointerDown={(e) => {
        // Clicking empty space deselects. preventDefault stops the underlying
        // PDF text layer from starting a text selection.
        e.preventDefault();
        setSelectedField(null);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={cancelInteraction}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        // touch-action stays on the draggable boxes below, not here: claiming every
        // gesture over the page would stop touch users panning the document at all.
        userSelect: "none",
        WebkitUserSelect: "none",
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
              const singleWidget = (field.widgets?.length ?? 0) === 1;
              // Select and start moving in one gesture; a click without movement
              // just selects, since endInteraction ignores a zero delta.
              if (field.name !== selectedFieldName)
                setSelectedField(field.name);
              if (singleWidget) beginInteraction(e, field, "move");
            }}
            style={{
              position: "absolute",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              border: isDeleted
                ? `1.5px dashed ${FORM_COLORS.danger}`
                : isSelected
                  ? `2px solid ${FORM_COLORS.accent}`
                  : `1.5px solid ${FORM_COLORS.neutralBorder}`,
              background: isDeleted
                ? FORM_COLORS.dangerFill
                : isSelected
                  ? FORM_COLORS.accentFill
                  : FORM_COLORS.neutralFill,
              borderRadius: 2,
              boxSizing: "border-box",
              // Claim the gesture only where a drag can actually start, so touch users can
              // still pan the page over boxes that are not draggable.
              touchAction:
                !isDeleted && (field.widgets?.length ?? 0) === 1
                  ? "none"
                  : "auto",
              cursor: isDeleted
                ? "not-allowed"
                : (field.widgets?.length ?? 0) === 1
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
                background: isDeleted
                  ? FORM_COLORS.danger
                  : isSelected
                    ? FORM_COLORS.accent
                    : FORM_COLORS.neutralChip,
                color: "#fff",
                borderRadius: 2,
                whiteSpace: "nowrap",
                opacity: isSelected || isDeleted ? 1 : 0.75,
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
              onPointerDown={(e) =>
                selectedField &&
                beginInteraction(e, selectedField, "resize", h.id)
              }
              style={{
                position: "absolute",
                left: pos.x - HANDLE_SIZE / 2,
                top: pos.y - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                background: "#fff",
                border: `1.5px solid ${FORM_COLORS.accent}`,
                borderRadius: 2,
                touchAction: "none",
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
