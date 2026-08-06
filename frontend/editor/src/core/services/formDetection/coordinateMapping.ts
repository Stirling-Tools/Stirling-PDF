// Map a detection (original bitmap pixels, top-left origin) to PDF points (bottom-left origin).
// 1:1 port of CoordinateMapper.toPdfPoints in the backend.

import { Detection, RectPt } from "@app/services/formDetection/types";

export interface RasterPageInfo {
  pageWidthPt: number;
  pageHeightPt: number;
  scaleX: number; // pixels per point
  scaleY: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : Math.min(v, hi);
}

export function toPdfPoints(d: Detection, page: RasterPageInfo): RectPt {
  const sx = page.scaleX > 0 ? page.scaleX : 1;
  const sy = page.scaleY > 0 ? page.scaleY : 1;

  const wPt = d.w / sx;
  const hPt = d.h / sy;
  let xPt = d.x / sx;
  // Flip Y: bitmap origin is top-left, PDF origin is bottom-left.
  let yPt = page.pageHeightPt - d.y / sy - hPt;

  xPt = clamp(xPt, 0, page.pageWidthPt);
  yPt = clamp(yPt, 0, page.pageHeightPt);
  const w = clamp(wPt, 0, page.pageWidthPt - xPt);
  const h = clamp(hPt, 0, page.pageHeightPt - yPt);
  return { x: xPt, y: yPt, w, h };
}
