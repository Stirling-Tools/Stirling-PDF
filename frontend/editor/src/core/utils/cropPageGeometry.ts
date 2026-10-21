import type { Rectangle } from "@app/utils/cropCoordinates";

/** Clockwise page rotation, normalised to the four right angles PDF.js can report. */
export type PageRotation = 0 | 90 | 180 | 270;

/**
 * A page is rendered rotated and cropped to its view box, while the crop
 * request speaks unrotated page user space. Every conversion between the two
 * goes through this shape so the two frames cannot drift apart.
 */
export interface CropPageGeometry {
  /** PDF.js page view box: [x0, y0, x1, y1], bottom-left origin. */
  viewBox: [number, number, number, number];
  rotation: PageRotation;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Smallest crop the backend can meaningfully apply, in points. */
export const MIN_CROP_POINTS = 4;

export const MM_PER_POINT = 25.4 / 72;

const roundTenth = (value: number): number => Math.round(value * 10) / 10;

export function normalizeRotation(rotation: number): PageRotation {
  const normalized = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  return normalized as PageRotation;
}

function viewBoxOf(geometry: CropPageGeometry) {
  const [x0, y0, x1, y1] = geometry.viewBox;
  return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 };
}

/** Size of the page as the user sees it, after rotation, in points. */
export function getDisplaySize(geometry: CropPageGeometry): PageSize {
  const { width, height } = viewBoxOf(geometry);
  const rotation = normalizeRotation(geometry.rotation);
  return rotation % 180 === 0
    ? { width, height }
    : { width: height, height: width };
}

/** Display point (top-left origin, y down) to page user space (bottom-left, y up). */
export function displayPointToPage(
  point: Point,
  geometry: CropPageGeometry,
): Point {
  const { x0, y0, x1, y1, width, height } = viewBoxOf(geometry);
  const display = getDisplaySize(geometry);
  const u = display.width === 0 ? 0 : point.x / display.width;
  const v = display.height === 0 ? 0 : point.y / display.height;

  switch (normalizeRotation(geometry.rotation)) {
    case 90:
      return { x: x0 + v * width, y: y0 + u * height };
    case 180:
      return { x: x1 - u * width, y: y0 + v * height };
    case 270:
      return { x: x1 - v * width, y: y1 - u * height };
    default:
      return { x: x0 + u * width, y: y1 - v * height };
  }
}

/** Page user space to display point (top-left origin, y down). */
export function pagePointToDisplay(
  point: Point,
  geometry: CropPageGeometry,
): Point {
  const { x0, y0, x1, y1, width, height } = viewBoxOf(geometry);
  const display = getDisplaySize(geometry);
  let u: number;
  let v: number;

  switch (normalizeRotation(geometry.rotation)) {
    case 90:
      u = height === 0 ? 0 : (point.y - y0) / height;
      v = width === 0 ? 0 : (point.x - x0) / width;
      break;
    case 180:
      u = width === 0 ? 0 : (x1 - point.x) / width;
      v = height === 0 ? 0 : (point.y - y0) / height;
      break;
    case 270:
      u = height === 0 ? 0 : (y1 - point.y) / height;
      v = width === 0 ? 0 : (x1 - point.x) / width;
      break;
    default:
      u = width === 0 ? 0 : (point.x - x0) / width;
      v = height === 0 ? 0 : (y1 - point.y) / height;
      break;
  }

  return { x: u * display.width, y: v * display.height };
}

export function displayRectToPage(
  rect: Rectangle,
  geometry: CropPageGeometry,
): Rectangle {
  const a = displayPointToPage({ x: rect.x, y: rect.y }, geometry);
  const b = displayPointToPage(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    geometry,
  );
  return {
    x: roundTenth(Math.min(a.x, b.x)),
    y: roundTenth(Math.min(a.y, b.y)),
    width: roundTenth(Math.abs(b.x - a.x)),
    height: roundTenth(Math.abs(b.y - a.y)),
  };
}

export function pageRectToDisplay(
  rect: Rectangle,
  geometry: CropPageGeometry,
): Rectangle {
  const a = pagePointToDisplay({ x: rect.x, y: rect.y }, geometry);
  const b = pagePointToDisplay(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    geometry,
  );
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Page user-space bounds the crop must stay inside. */
export function getPageBox(geometry: CropPageGeometry): Rectangle {
  const { x0, y0, width, height } = viewBoxOf(geometry);
  return { x: x0, y: y0, width, height };
}

export function clampPageRect(
  rect: Rectangle,
  geometry: CropPageGeometry,
  minSize: number = MIN_CROP_POINTS,
): Rectangle {
  const box = getPageBox(geometry);
  const width = Math.min(Math.max(rect.width, minSize), box.width);
  const height = Math.min(Math.max(rect.height, minSize), box.height);
  return {
    x: roundTenth(Math.min(Math.max(rect.x, box.x), box.x + box.width - width)),
    y: roundTenth(
      Math.min(Math.max(rect.y, box.y), box.y + box.height - height),
    ),
    width: roundTenth(width),
    height: roundTenth(height),
  };
}

export function createFullPageRect(geometry: CropPageGeometry): Rectangle {
  const { x0, y0, width, height } = viewBoxOf(geometry);
  return {
    x: roundTenth(x0),
    y: roundTenth(y0),
    width: roundTenth(width),
    height: roundTenth(height),
  };
}

/** Centred inset crop, `fraction` of each dimension removed from every edge. */
export function createInsetPageRect(
  geometry: CropPageGeometry,
  fraction: number,
): Rectangle {
  const box = getPageBox(geometry);
  const insetX = box.width * fraction;
  const insetY = box.height * fraction;
  return {
    x: roundTenth(box.x + insetX),
    y: roundTenth(box.y + insetY),
    width: roundTenth(box.width - insetX * 2),
    height: roundTenth(box.height - insetY * 2),
  };
}

export function isFullPageRect(
  rect: Rectangle,
  geometry: CropPageGeometry,
  tolerance = 0.5,
): boolean {
  const box = getPageBox(geometry);
  return (
    Math.abs(rect.x - box.x) < tolerance &&
    Math.abs(rect.y - box.y) < tolerance &&
    Math.abs(rect.width - box.width) < tolerance &&
    Math.abs(rect.height - box.height) < tolerance
  );
}
