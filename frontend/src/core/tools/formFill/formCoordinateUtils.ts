/**
 * Coordinate conversion utilities for form field creation/editing.
 *
 * The FormFieldOverlay renders widgets in CSS space (top-left origin, y goes down).
 * The backend NewFormFieldDefinition expects PDF space (bottom-left origin, y goes up).
 *
 * Both coordinate systems use PDF points as units. The CSS overlay multiplies by
 * scaleX/scaleY to get pixel positions; these utilities work in the pre-scaled
 * PDF-point space.
 */

export interface CssRect {
  x: number;      // left, in PDF points (CSS TL origin)
  y: number;      // top, in PDF points (CSS TL origin)
  width: number;  // PDF points
  height: number; // PDF points
}

export interface PdfRect {
  x: number;      // lower-left X in PDF points (PDF BL origin)
  y: number;      // lower-left Y in PDF points (PDF BL origin)
  width: number;  // PDF points
  height: number; // PDF points
}

/**
 * Convert CSS overlay coordinates (top-left origin) to PDF coordinates (bottom-left origin).
 *
 * @param css    - Rectangle in CSS space (y = distance from top)
 * @param pageHeightPts - The un-rotated page height in PDF points
 */
export function cssToPdfRect(css: CssRect, pageHeightPts: number): PdfRect {
  // In CSS: y is distance from top edge
  // In PDF: y is distance from bottom edge
  // PDF lower-left Y = pageHeight - (css.y + css.height)
  return {
    x: css.x,
    y: pageHeightPts - (css.y + css.height),
    width: css.width,
    height: css.height,
  };
}

/**
 * Convert PDF coordinates (bottom-left origin) to CSS overlay coordinates (top-left origin).
 *
 * @param pdf    - Rectangle in PDF space (y = distance from bottom)
 * @param pageHeightPts - The un-rotated page height in PDF points
 */
export function pdfToCssRect(pdf: PdfRect, pageHeightPts: number): CssRect {
  return {
    x: pdf.x,
    y: pageHeightPts - pdf.y - pdf.height,
    width: pdf.width,
    height: pdf.height,
  };
}

/**
 * Convert pixel coordinates from a pointer event to PDF-point coordinates,
 * given the container dimensions and the page's PDF-point dimensions.
 */
export function pixelsToPdfPoints(
  pixelX: number,
  pixelY: number,
  containerWidth: number,
  containerHeight: number,
  pageWidthPts: number,
  pageHeightPts: number,
): { x: number; y: number } {
  return {
    x: (pixelX / containerWidth) * pageWidthPts,
    y: (pixelY / containerHeight) * pageHeightPts,
  };
}
