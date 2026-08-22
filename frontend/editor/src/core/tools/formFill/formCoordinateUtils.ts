/**
 * Three spaces: page pixels (top-left), WidgetCoordinates points (top-left, CropBox-relative),
 * and add/modify-fields points (lower-left, CropBox-relative). pageHeightPts is CropBox height.
 */

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** CropBox-relative, lower-left-origin PDF points (backend create/modify space). */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Top-left-origin PDF points, as stored on a WidgetCoordinates. */
export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Convert a widget's top-left-origin point rect to pixel space for rendering. */
export function widgetRectToPixels(
  widget: WidgetRect,
  scaleX: number,
  scaleY: number,
): PixelRect {
  return {
    left: widget.x * scaleX,
    top: widget.y * scaleY,
    width: widget.width * scaleX,
    height: widget.height * scaleY,
  };
}

/** Pixel rect (top-left) to backend PDF points (lower-left, CropBox-relative). */
export function pixelsToBackendRect(
  rect: PixelRect,
  scaleX: number,
  scaleY: number,
  pageHeightPts: number,
): PdfRect {
  const xPts = rect.left / scaleX;
  const widthPts = rect.width / scaleX;
  const heightPts = rect.height / scaleY;
  const topPts = rect.top / scaleY; // distance from page top, in points
  // Flip to lower-left origin: y measures page bottom to the field's bottom edge.
  const yPts = pageHeightPts - topPts - heightPts;
  return { x: xPts, y: yPts, width: widthPts, height: heightPts };
}

/** Backend PDF points (lower-left, CropBox-relative) to a pixel rect (top-left). */
export function backendRectToPixels(
  rect: PdfRect,
  scaleX: number,
  scaleY: number,
  pageHeightPts: number,
): PixelRect {
  const topPts = pageHeightPts - rect.y - rect.height;
  return {
    left: rect.x * scaleX,
    top: topPts * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

/** Clamp a pixel rect so it stays within the page bounds. */
export function clampPixelRect(
  rect: PixelRect,
  pageWidthPx: number,
  pageHeightPx: number,
): PixelRect {
  const width = Math.min(rect.width, pageWidthPx);
  const height = Math.min(rect.height, pageHeightPx);
  const left = Math.max(0, Math.min(rect.left, pageWidthPx - width));
  const top = Math.max(0, Math.min(rect.top, pageHeightPx - height));
  return { left, top, width, height };
}

/** Round a PdfRect's components to a sane precision before sending to the API. */
export function roundPdfRect(rect: PdfRect): PdfRect {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    x: r(rect.x),
    y: r(rect.y),
    width: r(rect.width),
    height: r(rect.height),
  };
}
