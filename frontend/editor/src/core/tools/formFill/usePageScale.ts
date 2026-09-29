/** Shared pixel<->PDF-point helpers, on the same basis as FormFieldOverlay so the overlays agree. */
import { useMemo } from "react";
import { useDocumentState } from "@embedpdf/core/react";

export interface PageScale {
  scaleX: number;
  scaleY: number;
  /** CropBox height in PDF points; 0 until the page has rendered. */
  pageHeightPts: number;
  /** CropBox width in PDF points; 0 until the page has rendered. */
  pageWidthPts: number;
  /** Page rotation in clockwise quarter turns (0-3), as EmbedPDF's <Rotate> applies it. */
  rotation: number;
}

/** Rotation as clockwise quarter turns, matching LocalEmbedPDF's normalizePageRotation. */
function normalizeRotation(rotation: number | null | undefined): number {
  const value =
    typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;
  return ((Math.round(value) % 4) + 4) % 4;
}

/**
 * `scaleX = pageWidthPx / pageWidthPts`, from EmbedPDF's document state.
 * pageWidthPts is 0 until the page has rendered, so guard on it before drawing.
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
    // Must match EmbedPDF's <Rotate>, which composes the page's own rotation
    // with the viewer-level one; using only the page's is wrong once rotated.
    const rotation = normalizeRotation(
      (pdfPage?.rotation ?? 0) + (documentState?.rotation ?? 0),
    );
    if (!pdfPage?.size || !pageWidth || !pageHeight) {
      const s = documentState?.scale ?? 1;
      return {
        scaleX: s,
        scaleY: s,
        pageHeightPts: 0,
        pageWidthPts: 0,
        rotation,
      };
    }
    return {
      scaleX: pageWidth / pdfPage.size.width,
      scaleY: pageHeight / pdfPage.size.height,
      pageHeightPts: pdfPage.size.height,
      pageWidthPts: pdfPage.size.width,
      rotation,
    };
  }, [documentState, pageIndex, pageWidth, pageHeight]);
}

/**
 * Pointer position in the element's own un-rotated pixel space. getBoundingClientRect
 * returns the axis-aligned screen box, so under <Rotate> it must be mapped back.
 */
export function getLocalPoint(
  e: { clientX: number; clientY: number },
  el: HTMLElement | null,
  rotation: number = 0,
): { x: number; y: number } {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  switch (normalizeRotation(rotation)) {
    case 1:
      return { x: sy, y: rect.width - sx };
    case 2:
      return { x: rect.width - sx, y: rect.height - sy };
    case 3:
      return { x: rect.height - sy, y: sx };
    default:
      return { x: sx, y: sy };
  }
}

/** True when a key event targets somewhere the user is typing, so shortcuts must stand down. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
