/**
 * FormFieldCreationOverlay — Rendered on PDF pages in "Create" mode.
 *
 * - Shows crosshair cursor when a field type is selected for placement
 * - Handles drag-to-define field rectangle (pointerdown → pointermove → pointerup)
 * - Renders a preview rectangle during drag
 * - Renders pending (uncommitted) fields as dashed outlines
 * - Converts CSS coordinates to PDF coordinates on completion
 * - Snaps to nearby field edges with visual guide lines
 */
import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { useDocumentState } from '@embedpdf/core/react';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { cssToPdfRect, pixelsToPdfPoints } from '@app/tools/formFill/formCoordinateUtils';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import {
  collectSnapTargets,
  collectPendingFieldSnapTargets,
  snapRect,
  type SnapGuide,
} from '@app/tools/formFill/formSnapUtils';
import type { NewFieldDefinition } from '@app/tools/formFill/types';

const MIN_SIZE_PTS = 10;

interface FormFieldCreationOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

export function FormFieldCreationOverlay({
  documentId,
  pageIndex,
  pageWidth,
  pageHeight,
}: FormFieldCreationOverlayProps) {
  const {
    mode,
    creationState,
    setCreationDragRect,
    addPendingField,
    setPlacingFieldType,
    modifiedFields,
    state: { fields: allFields },
  } = useFormFill();

  const documentState = useDocumentState(documentId);

  const { scaleX, scaleY, pageWidthPts, pageHeightPts } = useMemo(() => {
    const pdfPage = documentState?.document?.pages?.[pageIndex];
    if (!pdfPage || !pdfPage.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return { scaleX: s, scaleY: s, pageWidthPts: pageWidth / s, pageHeightPts: pageHeight / s };
    }
    // Prefer CropBox height from backend (if available) for exact Y-flip consistency.
    const firstWidget = allFields
      .find(f => f.widgets?.some(w => w.pageIndex === pageIndex))
      ?.widgets?.find(w => w.pageIndex === pageIndex);
    const cbHeight = firstWidget?.cropBoxHeight;
    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
      pageWidthPts: pdfPage.size.width,
      pageHeightPts: cbHeight ?? pdfPage.size.height,
    };
  }, [documentState, pageIndex, pageWidth, pageHeight, allFields]);

  const dragging = useRef<{ startX: number; startY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!creationState.placingFieldType) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    dragging.current = { startX: pixelX, startY: pixelY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setCreationDragRect({
      x: pixelX,
      y: pixelY,
      width: 0,
      height: 0,
      pageIndex,
    });
  }, [creationState.placingFieldType, pageIndex, setCreationDragRect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !creationState.placingFieldType) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pixelX = Math.max(0, Math.min(pageWidth, e.clientX - rect.left));
    const pixelY = Math.max(0, Math.min(pageHeight, e.clientY - rect.top));

    let x = Math.min(dragging.current.startX, pixelX);
    let y = Math.min(dragging.current.startY, pixelY);
    const width = Math.abs(pixelX - dragging.current.startX);
    const height = Math.abs(pixelY - dragging.current.startY);

    // Apply snapping to the drag rectangle
    const existingTargets = collectSnapTargets(
      allFields, null, pageIndex,
      scaleX, scaleY, pageHeightPts, modifiedFields,
    );
    const pendingTargets = collectPendingFieldSnapTargets(
      creationState.pendingFields, pageIndex,
      scaleX, scaleY, pageHeightPts,
    );
    const targets = [...existingTargets, ...pendingTargets];
    const snapped = snapRect(x, y, width, height, targets);
    x = snapped.left;
    y = snapped.top;
    setSnapGuides(snapped.guides);

    setCreationDragRect({ x, y, width, height, pageIndex });
  }, [creationState.placingFieldType, creationState.pendingFields, pageWidth, pageHeight, pageIndex, allFields, scaleX, scaleY, pageHeightPts, modifiedFields, setCreationDragRect]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !creationState.placingFieldType) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setSnapGuides([]);

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) {
      dragging.current = null;
      setCreationDragRect(null);
      return;
    }

    const pixelX = Math.max(0, Math.min(pageWidth, e.clientX - rect.left));
    const pixelY = Math.max(0, Math.min(pageHeight, e.clientY - rect.top));

    // Compute CSS rect in PDF points
    const startPts = pixelsToPdfPoints(
      dragging.current.startX, dragging.current.startY,
      pageWidth, pageHeight, pageWidthPts, pageHeightPts
    );
    const endPts = pixelsToPdfPoints(
      pixelX, pixelY,
      pageWidth, pageHeight, pageWidthPts, pageHeightPts
    );

    const cssX = Math.min(startPts.x, endPts.x);
    const cssY = Math.min(startPts.y, endPts.y);
    const cssW = Math.abs(endPts.x - startPts.x);
    const cssH = Math.abs(endPts.y - startPts.y);

    dragging.current = null;
    setCreationDragRect(null);

    // Enforce minimum size
    if (cssW < MIN_SIZE_PTS || cssH < MIN_SIZE_PTS) return;

    // Convert from CSS TL origin to PDF BL origin
    const pdfRect = cssToPdfRect(
      { x: cssX, y: cssY, width: cssW, height: cssH },
      pageHeightPts
    );

    const fieldType = creationState.placingFieldType;
    const count = creationState.pendingFields.length;
    const newField: NewFieldDefinition = {
      name: `${fieldType}_${count + 1}`,
      type: fieldType,
      pageIndex,
      x: pdfRect.x,
      y: pdfRect.y,
      width: pdfRect.width,
      height: pdfRect.height,
    };

    addPendingField(newField);
  }, [
    creationState.placingFieldType,
    creationState.pendingFields.length,
    pageWidth, pageHeight, pageWidthPts, pageHeightPts,
    pageIndex, setCreationDragRect, addPendingField,
  ]);

  // Escape to cancel placement
  useEffect(() => {
    if (mode !== 'make') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (creationState.placingFieldType) {
          setPlacingFieldType(null);
          setCreationDragRect(null);
          dragging.current = null;
          setSnapGuides([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, creationState.placingFieldType, setPlacingFieldType, setCreationDragRect]);

  // Don't render if not in create mode
  if (mode !== 'make') return null;

  const isPlacing = !!creationState.placingFieldType;
  const dragRect = creationState.dragRect;
  const showDragRect = dragRect && dragRect.pageIndex === pageIndex;

  // Render pending fields for this page
  const pendingForPage = creationState.pendingFields.filter(f => f.pageIndex === pageIndex);

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
        cursor: isPlacing ? 'crosshair' : 'default',
        pointerEvents: isPlacing ? 'auto' : 'none',
      }}
      onPointerDown={handlePointerDown}
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

      {/* Drag preview rectangle */}
      {showDragRect && dragRect.width > 0 && dragRect.height > 0 && (
        <div
          style={{
            position: 'absolute',
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.width,
            height: dragRect.height,
            border: '2px dashed var(--mantine-color-blue-5)',
            background: 'rgba(33, 150, 243, 0.1)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Pending fields as dashed outlines */}
      {pendingForPage.map((field, idx) => {
        // Convert PDF coords back to CSS for display
        const cssY = pageHeightPts - field.y - field.height;
        const left = field.x * scaleX;
        const top = cssY * scaleY;
        const width = field.width * scaleX;
        const height = field.height * scaleY;
        const color = `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-5)`;

        return (
          <div
            key={`pending-${idx}`}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              border: `2px dashed ${color}`,
              background: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-light)`,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              opacity: 0.8,
            }}
          >
            <span style={{ fontSize: Math.min(height * 0.6, 18), color, lineHeight: 1, display: 'flex' }}>
              {FIELD_TYPE_ICON[field.type]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
