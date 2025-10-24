/**
 * Utility functions for crop coordinate conversion and PDF bounds handling
 */

export interface PDFBounds {
  /** PDF width in points (actual PDF dimensions) */
  actualWidth: number;
  /** PDF height in points (actual PDF dimensions) */
  actualHeight: number;
  /** Thumbnail display width in pixels */
  thumbnailWidth: number;
  /** Thumbnail display height in pixels */
  thumbnailHeight: number;
  /** Horizontal offset for centering thumbnail in container */
  offsetX: number;
  /** Vertical offset for centering thumbnail in container */
  offsetY: number;
  /** Scale factor: thumbnailSize / actualSize */
  scale: number;
}

export interface Rectangle {
  /** X coordinate  */
  x: number;
  /** Y coordinate */
  y: number;
  /** Width  */
  width: number;
  /** Height */
  height: number;
}

/** Runtime type guard */
export function isRectangle(value: unknown): value is Rectangle {
  if (value === null || typeof value !== "object") return false;

  const r = value as Record<string, unknown>;
  const isNum = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n);

  return (
    isNum(r.x) &&
    isNum(r.y) &&
    isNum(r.width) &&
    isNum(r.height) &&
    r.width >= 0 &&
    r.height >= 0
  );
}

/**
 * Calculate PDF bounds for coordinate conversion based on thumbnail dimensions
 */
export const calculatePDFBounds = (
  actualPDFWidth: number,
  actualPDFHeight: number,
  containerWidth: number,
  containerHeight: number
): PDFBounds => {
  // Calculate scale to fit PDF within container while maintaining aspect ratio
  const scaleX = containerWidth / actualPDFWidth;
  const scaleY = containerHeight / actualPDFHeight;
  const scale = Math.min(scaleX, scaleY);

  // Calculate actual thumbnail display size
  const thumbnailWidth = actualPDFWidth * scale;
  const thumbnailHeight = actualPDFHeight * scale;

  // Calculate centering offsets - these represent where the thumbnail is positioned within the container
  const offsetX = (containerWidth - thumbnailWidth) / 2;
  const offsetY = (containerHeight - thumbnailHeight) / 2;

  return {
    actualWidth: actualPDFWidth,
    actualHeight: actualPDFHeight,
    thumbnailWidth,
    thumbnailHeight,
    offsetX,
    offsetY,
    scale
  };
};

/**
 * Convert DOM coordinates (relative to container) to PDF coordinates
 * Handles coordinate system conversion (DOM uses top-left, PDF uses bottom-left origin)
 */
export const domToPDFCoordinates = (
  domRect: Rectangle,
  pdfBounds: PDFBounds
): Rectangle => {
  // Convert DOM coordinates to thumbnail-relative coordinates
  const thumbX = domRect.x - pdfBounds.offsetX;
  const thumbY = domRect.y - pdfBounds.offsetY;

  // Convert to PDF coordinates (scale and flip Y-axis)
  const pdfX = thumbX / pdfBounds.scale;
  const pdfY = pdfBounds.actualHeight - ((thumbY + domRect.height) / pdfBounds.scale);
  const pdfWidth = domRect.width / pdfBounds.scale;
  const pdfHeight = domRect.height / pdfBounds.scale;

  return {
    x: pdfX,
    y: pdfY,
    width: pdfWidth,
    height: pdfHeight
  };
};

/**
 * Convert PDF coordinates to DOM coordinates (relative to container)
 */
export const pdfToDOMCoordinates = (
  cropArea: Rectangle,
  pdfBounds: PDFBounds
): Rectangle => {
  // Convert PDF coordinates to thumbnail coordinates (scale and flip Y-axis)
  const thumbX = cropArea.x * pdfBounds.scale;
  const thumbY = (pdfBounds.actualHeight - cropArea.y - cropArea.height) * pdfBounds.scale;
  const thumbWidth = cropArea.width * pdfBounds.scale;
  const thumbHeight = cropArea.height * pdfBounds.scale;

  // Add container offsets to get DOM coordinates
  return {
    x: thumbX + pdfBounds.offsetX,
    y: thumbY + pdfBounds.offsetY,
    width: thumbWidth,
    height: thumbHeight
  };
};

/**
 * Constrain a crop area to stay within PDF bounds
 */
export const constrainCropAreaToPDF = (
  cropArea: Rectangle,
  pdfBounds: PDFBounds
): Rectangle => {
  // Ensure crop area doesn't extend beyond PDF boundaries
  const maxX = Math.max(0, pdfBounds.actualWidth - cropArea.width);
  const maxY = Math.max(0, pdfBounds.actualHeight - cropArea.height);

  return {
    x: Math.max(0, Math.min(cropArea.x, maxX)),
    y: Math.max(0, Math.min(cropArea.y, maxY)),
    width: Math.min(cropArea.width, pdfBounds.actualWidth - Math.max(0, cropArea.x)),
    height: Math.min(cropArea.height, pdfBounds.actualHeight - Math.max(0, cropArea.y))
  };
};

/**
 * Constrain DOM coordinates to stay within thumbnail bounds
 */
export const constrainDOMRectToThumbnail = (
  domRect: Rectangle,
  pdfBounds: PDFBounds
): Rectangle => {
  const thumbnailLeft = pdfBounds.offsetX;
  const thumbnailTop = pdfBounds.offsetY;
  const thumbnailRight = pdfBounds.offsetX + pdfBounds.thumbnailWidth;
  const thumbnailBottom = pdfBounds.offsetY + pdfBounds.thumbnailHeight;

  // Constrain position
  const maxX = Math.max(thumbnailLeft, thumbnailRight - domRect.width);
  const maxY = Math.max(thumbnailTop, thumbnailBottom - domRect.height);

  const constrainedX = Math.max(thumbnailLeft, Math.min(domRect.x, maxX));
  const constrainedY = Math.max(thumbnailTop, Math.min(domRect.y, maxY));

  // Constrain size to fit within thumbnail bounds from current position
  const maxWidth = thumbnailRight - constrainedX;
  const maxHeight = thumbnailBottom - constrainedY;

  return {
    x: constrainedX,
    y: constrainedY,
    width: Math.min(domRect.width, maxWidth),
    height: Math.min(domRect.height, maxHeight)
  };
};

/**
 * Check if a point is within the thumbnail area (not just the container)
 */
export const isPointInThumbnail = (
  x: number,
  y: number,
  pdfBounds: PDFBounds
): boolean => {
  return x >= pdfBounds.offsetX &&
         x <= pdfBounds.offsetX + pdfBounds.thumbnailWidth &&
         y >= pdfBounds.offsetY &&
         y <= pdfBounds.offsetY + pdfBounds.thumbnailHeight;
};

/**
 * Create a default crop area that covers the entire PDF
 */
export const createFullPDFCropArea = (pdfBounds: PDFBounds): Rectangle => {
  return {
    x: 0,
    y: 0,
    width: pdfBounds.actualWidth,
    height: pdfBounds.actualHeight
  };
};

/**
 * Round crop coordinates to reasonable precision (0.1 point)
 */
export const roundCropArea = (cropArea: Rectangle): Rectangle => {
  return {
    x: Math.round(cropArea.x * 10) / 10,
    y: Math.round(cropArea.y * 10) / 10,
    width: Math.round(cropArea.width * 10) / 10,
    height: Math.round(cropArea.height * 10) / 10
  };
};
