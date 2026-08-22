// Map a detection (rendered bitmap pixels, top-left origin) to PDF points in unrotated user
// space (bottom-left origin, crop-box offset applied). 1:1 port of the backend CoordinateMapper:
// scale + Y-flip into display space, inverse page rotation, then the crop-box translation.

import { Detection, RectPt } from "@app/services/formDetection/types";

export interface RasterPageInfo {
  pageWidthPt: number;
  pageHeightPt: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  userWidthPt: number;
  userHeightPt: number;
  cropLlxPt: number;
  cropLlyPt: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : Math.min(v, hi);
}

export function toPdfPoints(d: Detection, page: RasterPageInfo): RectPt {
  const sx = page.scaleX > 0 ? page.scaleX : 1;
  const sy = page.scaleY > 0 ? page.scaleY : 1;

  const wd = d.w / sx;
  const hd = d.h / sy;
  const xd = d.x / sx;
  const yd = page.pageHeightPt - d.y / sy - hd;

  const uw = page.userWidthPt > 0 ? page.userWidthPt : page.pageWidthPt;
  const uh = page.userHeightPt > 0 ? page.userHeightPt : page.pageHeightPt;
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  switch (page.rotationDegrees) {
    case 90:
      x = uw - yd - hd;
      y = xd;
      w = hd;
      h = wd;
      break;
    case 180:
      x = uw - xd - wd;
      y = uh - yd - hd;
      w = wd;
      h = hd;
      break;
    case 270:
      x = yd;
      y = uh - xd - wd;
      w = hd;
      h = wd;
      break;
    default:
      x = xd;
      y = yd;
      w = wd;
      h = hd;
      break;
  }

  x = clamp(x, 0, uw);
  y = clamp(y, 0, uh);
  w = clamp(w, 0, uw - x);
  h = clamp(h, 0, uh - y);
  return { x: x + page.cropLlxPt, y: y + page.cropLlyPt, w, h };
}
