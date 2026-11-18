/**
 * Pure crop-rectangle maths, in normalised display space (0..1 across the
 * rendered page, origin top-left). Keeping it free of DOM and React makes the
 * interaction rules testable without a browser.
 */

export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const CROP_HANDLES: CropHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Smallest rectangle that still counts as a crop, expressed in normalised units. */
export type MinSize = { x: number; y: number };

function withMinSize(
  width: number,
  height: number,
  minSize: MinSize,
): { width: number; height: number } {
  return {
    width: Math.max(width, minSize.x),
    height: Math.max(height, minSize.y),
  };
}

/** Rectangle between two dragged corners, kept inside the page. */
export function drawRect(
  anchor: { x: number; y: number },
  point: { x: number; y: number },
  ratio: number | null,
  minSize: MinSize,
): NormalizedRect {
  const dirX = point.x >= anchor.x ? 1 : -1;
  const dirY = point.y >= anchor.y ? 1 : -1;
  let width = Math.abs(point.x - anchor.x);
  let height = Math.abs(point.y - anchor.y);

  if (ratio) {
    if (width / Math.max(height, 1e-6) > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    const maxWidth = dirX === 1 ? 1 - anchor.x : anchor.x;
    const maxHeight = dirY === 1 ? 1 - anchor.y : anchor.y;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
  }

  const sized = withMinSize(width, height, minSize);
  return {
    x: dirX === 1 ? anchor.x : anchor.x - sized.width,
    y: dirY === 1 ? anchor.y : anchor.y - sized.height,
    width: sized.width,
    height: sized.height,
  };
}

export function moveRect(
  start: NormalizedRect,
  deltaX: number,
  deltaY: number,
): NormalizedRect {
  return {
    x: clamp(start.x + deltaX, 0, Math.max(0, 1 - start.width)),
    y: clamp(start.y + deltaY, 0, Math.max(0, 1 - start.height)),
    width: start.width,
    height: start.height,
  };
}

export function resizeRect(
  handle: CropHandle,
  point: { x: number; y: number },
  start: NormalizedRect,
  ratio: number | null,
  minSize: MinSize,
): NormalizedRect {
  if (isCornerHandle(handle)) {
    return resizeCornerRect(handle, point, start, ratio, minSize);
  }

  const clampX = clamp(point.x, 0, 1);
  const clampY = clamp(point.y, 0, 1);
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");

  if (east || west) {
    const anchorX = east ? start.x : start.x + start.width;
    const width = Math.max(Math.abs(clampX - anchorX), minSize.x);
    if (ratio) {
      let height = width / ratio;
      const centerY = start.y + start.height / 2;
      const maxHeight = 2 * Math.min(centerY, 1 - centerY);
      if (height > maxHeight) {
        height = maxHeight;
      }
      height = Math.max(height, minSize.y);
      return {
        x: east ? anchorX : anchorX - width,
        y: centerY - height / 2,
        width,
        height,
      };
    }
    const sized = withMinSize(width, start.height, minSize);
    return {
      x: east ? anchorX : anchorX - sized.width,
      y: start.y,
      width: sized.width,
      height: sized.height,
    };
  }

  const anchorY = south ? start.y : start.y + start.height;
  const height = Math.max(Math.abs(clampY - anchorY), minSize.y);
  if (ratio) {
    let width = height * ratio;
    const centerX = start.x + start.width / 2;
    const maxWidth = 2 * Math.min(centerX, 1 - centerX);
    if (width > maxWidth) {
      width = maxWidth;
    }
    width = Math.max(width, minSize.x);
    return {
      x: centerX - width / 2,
      y: south ? anchorY : anchorY - height,
      width,
      height,
    };
  }
  return {
    x: start.x,
    y: south ? anchorY : anchorY - height,
    width: start.width,
    height,
  };
}

/** Corner resize: the opposite corner stays pinned, which is what a crop handle must do. */
export function resizeCornerRect(
  handle: CropHandle,
  point: { x: number; y: number },
  start: NormalizedRect,
  ratio: number | null,
  minSize: MinSize,
): NormalizedRect {
  const dirX = handle.includes("e") ? 1 : -1;
  const dirY = handle.includes("s") ? 1 : -1;
  const anchorX = dirX === 1 ? start.x : start.x + start.width;
  const anchorY = dirY === 1 ? start.y : start.y + start.height;
  let width = Math.max(Math.abs(clamp(point.x, 0, 1) - anchorX), minSize.x);
  let height = Math.max(Math.abs(clamp(point.y, 0, 1) - anchorY), minSize.y);

  if (ratio) {
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    const maxWidth = dirX === 1 ? 1 - anchorX : anchorX;
    const maxHeight = dirY === 1 ? 1 - anchorY : anchorY;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    width = Math.max(width, minSize.x);
    height = Math.max(height, minSize.y);
  }

  return {
    x: dirX === 1 ? anchorX : anchorX - width,
    y: dirY === 1 ? anchorY : anchorY - height,
    width,
    height,
  };
}

export function isCornerHandle(handle: CropHandle): boolean {
  return handle.length === 2;
}

/** Fit the largest rectangle with `ratio` inside the page, centred on `start`. */
export function fitRatio(ratio: number, start: NormalizedRect): NormalizedRect {
  const centerX = start.x + start.width / 2;
  const centerY = start.y + start.height / 2;
  const maxWidth = 2 * Math.min(centerX, 1 - centerX);
  const maxHeight = 2 * Math.min(centerY, 1 - centerY);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
