/**
 * Three spaces: page pixels (top-left), WidgetCoordinates points (top-left, CropBox-relative),
 * and add/modify-fields points (lower-left, CropBox-relative). pageHeightPts is CropBox height.
 */

import type {
  FormField,
  ModifyFieldDefinition,
} from "@app/tools/formFill/types";

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

/**
 * A field with its staged edit applied, back in the top-left widget space the extractor produces.
 * Mirrors updateWidgetGeometry: the delta moves every widget on the anchor page, but only the
 * first widget takes the new size.
 */
export function applyStagedGeometry(
  field: FormField,
  staged: ModifyFieldDefinition,
): FormField {
  const next: FormField = {
    ...field,
    type: staged.type ?? field.type,
    options: staged.options ?? field.options,
    readOnly: staged.readOnly ?? field.readOnly,
    multiline: staged.multiline ?? field.multiline,
  };

  const widgets = field.widgets;
  const anchor = widgets?.[0];
  if (
    !widgets ||
    !anchor ||
    staged.x == null ||
    staged.y == null ||
    staged.width == null ||
    staged.height == null ||
    anchor.cropBoxHeight == null
  ) {
    return next;
  }

  const top = anchor.cropBoxHeight - staged.y - staged.height;
  const dx = staged.x - anchor.x;
  const dy = top - anchor.y;
  next.widgets = widgets.map((w, i) =>
    w.pageIndex === anchor.pageIndex
      ? {
          ...w,
          x: w.x + dx,
          y: w.y + dy,
          width: i === 0 ? staged.width! : w.width,
          height: i === 0 ? staged.height! : w.height,
        }
      : w,
  );
  return next;
}

/**
 * Per-option rects inside the group box, in the box's own units. Mirrors FormUtils.
 * radioOptionRects exactly - if these two drift, the preview stops matching the applied PDF.
 */
export function radioOptionRects(
  box: { width: number; height: number },
  count: number,
  gapOverride?: number | null,
  sizeOverride?: number | null,
): { top: number; size: number }[] {
  const n = Math.max(1, count);
  const h = box.height;
  const slot = h / n;

  let size: number;
  if (sizeOverride != null && sizeOverride > 0) {
    size = sizeOverride;
  } else if (gapOverride != null && gapOverride >= 0) {
    size = (h - (n - 1) * gapOverride) / n;
  } else {
    size = slot * 0.75;
  }
  size = Math.max(1, Math.min(size, box.width));

  const gap =
    gapOverride != null && gapOverride >= 0
      ? gapOverride
      : n > 1
        ? Math.max(0, (h - n * size) / (n - 1))
        : 0;

  return Array.from({ length: n }, (_, i) => ({
    top: i * (size + gap),
    size,
  }));
}
