/**
 * Shared page-scale helpers for the form overlays.
 *
 * Both the creation and edit overlays need the pixel<->PDF-point scale for a
 * rendered page (and a pointer-to-local-pixel conversion). This centralises
 * that so they stay in sync with FormFieldOverlay's basis and don't duplicate
 * the documentState math.
 */
import { useMemo } from "react";
import { useDocumentState } from "@embedpdf/core/react";

export interface PageScale {
  scaleX: number;
  scaleY: number;
  /** CropBox height in PDF points; 0 until the page has rendered. */
  pageHeightPts: number;
  /** CropBox width in PDF points; 0 until the page has rendered. */
  pageWidthPts: number;
}

/**
 * Pixel<->point scale for a page, derived from EmbedPDF's document state.
 * `scaleX = pageWidthPx / pageWidthPts`. `pageWidthPts` is 0 until the page has
 * rendered, so callers should guard on it before drawing.
 */
export function usePageScale(
  documentId: string,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
): PageScale {
  const documentState = useDocumentState(documentId);
  return useMemo(() => {
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
}

/** Pointer position relative to an element's top-left, in CSS pixels. */
export function getLocalPoint(
  e: { clientX: number; clientY: number },
  el: HTMLElement | null,
): { x: number; y: number } {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
