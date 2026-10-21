import type { PagePoint } from "./measurementTypes";

/** Polygon area in squared PDF points (shoelace formula). */
export function polygonArea(points: PagePoint[]): number {
  if (points.length < 3) return 0;
  if (points.some((p) => p.pageIndex !== points[0].pageIndex)) return 0;

  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Closed polygon perimeter in PDF points. */
export function polygonPerimeter(points: PagePoint[]): number {
  if (points.length < 2) return 0;
  if (points.some((p) => p.pageIndex !== points[0].pageIndex)) return 0;

  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Four corners from two diagonally opposite points. */
export function rectanglePoints(a: PagePoint, b: PagePoint): PagePoint[] {
  if (a.pageIndex !== b.pageIndex) return [];
  return [
    a,
    { pageIndex: a.pageIndex, x: b.x, y: a.y },
    b,
    { pageIndex: a.pageIndex, x: a.x, y: b.y },
  ];
}
