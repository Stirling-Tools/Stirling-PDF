/**
 * Crop rectangle primitives. All coordinates are PDF points in page user
 * space (origin bottom-left); display-space maths lives in cropPageGeometry.
 */

export interface Rectangle {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Width */
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

/** Round crop coordinates to reasonable precision (0.1 point) */
export const roundCropArea = (cropArea: Rectangle): Rectangle => ({
  x: Math.round(cropArea.x * 10) / 10,
  y: Math.round(cropArea.y * 10) / 10,
  width: Math.round(cropArea.width * 10) / 10,
  height: Math.round(cropArea.height * 10) / 10,
});

/** Keep a rectangle inside bounds while preserving a usable minimum size. */
export const clampRectToBox = (
  rect: Rectangle,
  box: Rectangle,
  minSize = 0.1,
): Rectangle => {
  const width = Math.min(Math.max(rect.width, minSize), box.width);
  const height = Math.min(Math.max(rect.height, minSize), box.height);
  return {
    x:
      Math.round(
        Math.min(Math.max(rect.x, box.x), box.x + box.width - width) * 10,
      ) / 10,
    y:
      Math.round(
        Math.min(Math.max(rect.y, box.y), box.y + box.height - height) * 10,
      ) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
};
