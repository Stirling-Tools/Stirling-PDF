/**
 * FormFieldEditOverlay — Rendered on PDF pages in "Modify" mode.
 *
 * - Click to select an existing field
 * - Drag field body to reposition
 * - Drag corner/edge handles to resize
 * - Updates modifiedFields in context on completion
 * - Snaps to nearby field edges with visual guide lines
 */
import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { cssToPdfRect, pdfToCssRect } from '@app/tools/formFill/formCoordinateUtils';
import { FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import { collectSnapTargets, snapRect, snapRectResize, type SnapGuide, type ResizeEdges } from '@app/tools/formFill/formSnapUtils';
import type { FormField, WidgetCoordinates } from '@app/tools/formFill/types';

const MIN_SIZE_PX = 8;
const HANDLE_SIZE = 8;

interface FormFieldEditOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  type: 'move' | 'resize';
  handle?: HandlePosition;
  startMouseX: number;
  startMouseY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
}

const HANDLE_POSITIONS: { pos: HandlePosition; cursor: string; top: string; left: string }[] = [
  { pos: 'nw', cursor: 'nwse-resize', top: '0%', left: '0%' },
  { pos: 'n',  cursor: 'ns-resize',   top: '0%', left: '50%' },
  { pos: 'ne', cursor: 'nesw-resize', top: '0%', left: '100%' },
  { pos: 'e',  cursor: 'ew-resize',   top: '50%', left: '100%' },
  { pos: 'se', cursor: 'nwse-resize', top: '100%', left: '100%' },
  { pos: 's',  cursor: 'ns-resize',   top: '100%', left: '50%' },
  { pos: 'sw', cursor: 'nesw-resize', top: '100%', left: '0%' },
  { pos: 'w',  cursor: 'ew-resize',   top: '50%', left: '0%' },
];

export function FormFieldEditOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
}: FormFieldEditOverlayProps) {
  const {
    mode,
    fieldsByPage,
    editState,
    setEditState,
    modifiedFields,
    updateFieldCoordinates,
    state: { fields: allFields },
  } = useFormFill();

  const documentState = useDocumentState(documentId);

  const pageFields = useMemo(
    () => fieldsByPage.get(pageIndex) || [],
    [fieldsByPage, pageIndex]
  );

  const { scaleX, scaleY, pageWidthPts, pageHeightPts } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage || !pdfPage.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return { scaleX: s, scaleY: s, pageWidthPts: pageWidth / s, pageHeightPts: pageHeight / s };
    }
    // Prefer CropBox height from backend (if available) for exact Y-flip consistency.
    const firstWidget = pageFields.find(f => f.widgets?.some(w => w.pageIndex === pageIndex))
      ?.widgets?.find(w => w.pageIndex === pageIndex);
    const cbHeight = firstWidget?.cropBoxHeight;
    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
      pageWidthPts: pdfPage.size.width,
      pageHeightPts: cbHeight ?? pdfPage.size.height,
    };
  }, [documentState, pageIndex, pageWidth, pageHeight, pageFields]);

  const dragRef = useRef<DragState | null>(null);
  const dragFieldRef = useRef<string | null>(null);
  const pendingRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  // Get the CSS rect for a field (considering pending modifications)
  const getFieldCssRect = useCallback((field: FormField, widget: WidgetCoordinates) => {
    const modified = modifiedFields.get(field.name);
    if (modified && modified.x != null && modified.y != null && modified.width != null && modified.height != null) {
      // modified coords are in PDF BL origin — convert to CSS using THIS widget's cropBoxHeight
      const cropBoxHeight = widget.cropBoxHeight ?? pageHeightPts;
      const css = pdfToCssRect(
        { x: modified.x, y: modified.y, width: modified.width, height: modified.height },
        cropBoxHeight
      );
      return {
        left: css.x * scaleX,
        top: css.y * scaleY,
        width: css.width * scaleX,
        height: css.height * scaleY,
      };
    }
    // Widget coords are already in CSS TL origin (y-flipped by backend)
    return {
      left: widget.x * scaleX,
      top: widget.y * scaleY,
      width: widget.width * scaleX,
      height: widget.height * scaleY,
    };
  }, [modifiedFields, pageHeightPts, scaleX, scaleY]);

  const handleFieldClick = useCallback((e: React.PointerEvent, fieldName: string) => {
    e.stopPropagation();
    setEditState({
      selectedFieldName: fieldName,
      interaction: 'idle',
      pendingRect: null,
    });
  }, [setEditState]);

  const handlePointerDown = useCallback((
    e: React.PointerEvent,
    fieldName: string,
    type: 'move' | 'resize',
    handle?: HandlePosition
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Find current CSS rect for this field
    const field = pageFields.find(f => f.name === fieldName);
    if (!field) return;
    const widget = field.widgets?.find(w => w.pageIndex === pageIndex);
    if (!widget) return;

    const rect = getFieldCssRect(field, widget);

    dragRef.current = {
      type,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    dragFieldRef.current = fieldName;

    setEditState({
      selectedFieldName: fieldName,
      interaction: type === 'move' ? 'moving' : 'resizing',
      pendingRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    });

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pageFields, pageIndex, getFieldCssRect, setEditState]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !dragFieldRef.current) return;
    e.preventDefault();

    const drag = dragRef.current;
    const dx = e.clientX - drag.startMouseX;
    const dy = e.clientY - drag.startMouseY;

    let newLeft = drag.startLeft;
    let newTop = drag.startTop;
    let newWidth = drag.startWidth;
    let newHeight = drag.startHeight;

    if (drag.type === 'move') {
      newLeft = Math.max(0, Math.min(pageWidth - drag.startWidth, drag.startLeft + dx));
      newTop = Math.max(0, Math.min(pageHeight - drag.startHeight, drag.startTop + dy));
    } else if (drag.type === 'resize' && drag.handle) {
      const h = drag.handle;
      // Adjust dimensions based on handle position
      if (h.includes('e')) {
        newWidth = Math.max(MIN_SIZE_PX, drag.startWidth + dx);
      }
      if (h.includes('w')) {
        const dw = Math.min(dx, drag.startWidth - MIN_SIZE_PX);
        newLeft = drag.startLeft + dw;
        newWidth = drag.startWidth - dw;
      }
      if (h.includes('s')) {
        newHeight = Math.max(MIN_SIZE_PX, drag.startHeight + dy);
      }
      if (h.includes('n')) {
        const dh = Math.min(dy, drag.startHeight - MIN_SIZE_PX);
        newTop = drag.startTop + dh;
        newHeight = drag.startHeight - dh;
      }
      // Clamp to page bounds
      newLeft = Math.max(0, newLeft);
      newTop = Math.max(0, newTop);
      if (newLeft + newWidth > pageWidth) newWidth = pageWidth - newLeft;
      if (newTop + newHeight > pageHeight) newHeight = pageHeight - newTop;
    }

    // Apply snapping
    const targets = collectSnapTargets(
      allFields, dragFieldRef.current, pageIndex,
      scaleX, scaleY, pageHeightPts, modifiedFields,
    );

    if (drag.type === 'move') {
      const snapped = snapRect(newLeft, newTop, newWidth, newHeight, targets);
      newLeft = snapped.left;
      newTop = snapped.top;
      setSnapGuides(snapped.guides);
    } else if (drag.type === 'resize' && drag.handle) {
      const h = drag.handle;
      const resizeEdges: ResizeEdges = {
        left: h.includes('w'),
        right: h.includes('e'),
        top: h.includes('n'),
        bottom: h.includes('s'),
      };
      const snapped = snapRectResize(newLeft, newTop, newWidth, newHeight, resizeEdges, targets);
      newLeft = snapped.left;
      newTop = snapped.top;
      newWidth = snapped.width;
      newHeight = snapped.height;
      setSnapGuides(snapped.guides);
    }

    const rect = { x: newLeft, y: newTop, width: newWidth, height: newHeight };
    pendingRectRef.current = rect;
    setEditState({
      interaction: drag.type === 'move' ? 'moving' : 'resizing',
      pendingRect: rect,
    });
  }, [pageWidth, pageHeight, allFields, pageIndex, scaleX, scaleY, pageHeightPts, modifiedFields, setEditState]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !dragFieldRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const pendingRect = pendingRectRef.current;
    const fieldName = dragFieldRef.current;

    dragRef.current = null;
    dragFieldRef.current = null;
    pendingRectRef.current = null;
    setSnapGuides([]);

    if (!pendingRect) {
      setEditState({ interaction: 'idle', pendingRect: null });
      return;
    }

    // Get the specific widget's cropBoxHeight for correct Y-flip.
    // Must match the height used during extraction to avoid coordinate mismatch.
    const field = allFields.find(f => f.name === fieldName);
    const widget = field?.widgets?.find(w => w.pageIndex === pageIndex);
    const cropBoxHeight = widget?.cropBoxHeight ?? pageHeightPts;

    // Convert pixel rect to PDF-point CSS rect, then to PDF BL origin
    const cssPts = {
      x: pendingRect.x / scaleX,
      y: pendingRect.y / scaleY,
      width: pendingRect.width / scaleX,
      height: pendingRect.height / scaleY,
    };
    const pdfRect = cssToPdfRect(cssPts, cropBoxHeight);

    updateFieldCoordinates(fieldName, {
      x: pdfRect.x,
      y: pdfRect.y,
      width: pdfRect.width,
      height: pdfRect.height,
    });

    setEditState({ interaction: 'idle', pendingRect: null });
  }, [scaleX, scaleY, pageHeightPts, updateFieldCoordinates, setEditState, allFields, pageIndex]);

  // Click on empty area deselects
  const handleOverlayClick = useCallback((e: React.PointerEvent) => {
    if (e.target === overlayRef.current) {
      setEditState({ selectedFieldName: null, interaction: 'idle', pendingRect: null });
    }
  }, [setEditState]);

  // Escape to deselect, Delete to remove selection
  useEffect(() => {
    if (mode !== 'modify') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editState.selectedFieldName) {
        setEditState({ selectedFieldName: null, interaction: 'idle', pendingRect: null });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, editState.selectedFieldName, setEditState]);

  if (mode !== 'modify') return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 15,
        pointerEvents: 'auto',
        cursor: editState.interaction !== 'idle' ? 'grabbing' : 'default',
      }}
      onPointerDown={handleOverlayClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Snap guide lines */}
      {snapGuides.map((guide, i) =>
        guide.axis === 'x' ? (
          <div
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              left: guide.position,
              top: 0,
              width: 0,
              height: '100%',
              borderLeft: '1px dashed rgba(255, 0, 100, 0.6)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        ) : (
          <div
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              top: guide.position,
              width: '100%',
              height: 0,
              borderTop: '1px dashed rgba(255, 0, 100, 0.6)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        )
      )}

      {pageFields.map((field) => {
        const widgets = (field.widgets || []).filter(w => w.pageIndex === pageIndex);
        if (widgets.length === 0) return null;
        const widget = widgets[0];
        const isSelected = editState.selectedFieldName === field.name;
        const isModified = modifiedFields.has(field.name);

        // Use pending rect during drag for the selected field
        const usesPending = isSelected && editState.pendingRect && editState.interaction !== 'idle';
        const rect = usesPending
          ? { left: editState.pendingRect!.x, top: editState.pendingRect!.y, width: editState.pendingRect!.width, height: editState.pendingRect!.height }
          : getFieldCssRect(field, widget);

        const color = `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-5)`;

        return (
          <div
            key={field.name}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              border: isSelected
                ? `2px solid ${color}`
                : `1px solid ${isModified ? color : 'rgba(33, 150, 243, 0.4)'}`,
              borderRadius: 2,
              background: isSelected ? 'rgba(33, 150, 243, 0.08)' : 'transparent',
              cursor: isSelected ? 'grab' : 'pointer',
              boxSizing: 'border-box',
              transition: editState.interaction !== 'idle' ? 'none' : 'border-color 0.15s',
            }}
            onPointerDown={(e) => {
              if (isSelected) {
                handlePointerDown(e, field.name, 'move');
              } else {
                handleFieldClick(e, field.name);
              }
            }}
          >
            {/* Resize handles — only for selected field */}
            {isSelected && editState.interaction === 'idle' && HANDLE_POSITIONS.map(({ pos, cursor, top, left }) => (
              <div
                key={pos}
                style={{
                  position: 'absolute',
                  top,
                  left,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  background: 'white',
                  border: `1.5px solid ${color}`,
                  borderRadius: 1,
                  transform: 'translate(-50%, -50%)',
                  cursor,
                  zIndex: 1,
                }}
                onPointerDown={(e) => handlePointerDown(e, field.name, 'resize', pos)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
