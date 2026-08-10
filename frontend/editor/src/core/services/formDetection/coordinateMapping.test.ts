import { describe, expect, it } from "vitest";
import {
  toPdfPoints,
  RasterPageInfo,
} from "@app/services/formDetection/coordinateMapping";

// Mirrors CoordinateMapperTest.java so the two engines stay in lockstep.

function page(
  displayW: number,
  displayH: number,
  scale: number,
  rotationDegrees: number,
  userW: number,
  userH: number,
  llx = 0,
  lly = 0,
): RasterPageInfo {
  return {
    pageWidthPt: displayW,
    pageHeightPt: displayH,
    scaleX: scale,
    scaleY: scale,
    rotationDegrees,
    userWidthPt: userW,
    userHeightPt: userH,
    cropLlxPt: llx,
    cropLlyPt: lly,
  };
}

const det = (x: number, y: number, w: number, h: number) => ({
  classId: 0,
  score: 0.9,
  x,
  y,
  w,
  h,
});

describe("formDetection coordinateMapping", () => {
  it("maps bitmap pixels to PDF points with a Y flip", () => {
    const r = toPdfPoints(det(10, 20, 40, 60), page(200, 300, 2, 0, 200, 300));
    expect(r.x).toBeCloseTo(5);
    expect(r.y).toBeCloseTo(260);
    expect(r.w).toBeCloseTo(20);
    expect(r.h).toBeCloseTo(30);
  });

  it("applies the crop-box origin", () => {
    const r = toPdfPoints(
      det(10, 20, 40, 60),
      page(200, 300, 2, 0, 200, 300, 30, 50),
    );
    expect(r.x).toBeCloseTo(35);
    expect(r.y).toBeCloseTo(310);
  });

  it("inverts /Rotate 90", () => {
    const r = toPdfPoints(det(40, 20, 80, 60), page(100, 200, 2, 90, 200, 100));
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(20);
    expect(r.w).toBeCloseTo(30);
    expect(r.h).toBeCloseTo(40);
  });

  it("inverts /Rotate 180", () => {
    const r = toPdfPoints(
      det(160, 20, 30, 40),
      page(200, 300, 1, 180, 200, 300),
    );
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(20);
    expect(r.w).toBeCloseTo(30);
    expect(r.h).toBeCloseTo(40);
  });

  it("inverts /Rotate 270", () => {
    const r = toPdfPoints(
      det(80, 320, 80, 60),
      page(100, 200, 2, 270, 200, 100),
    );
    expect(r.x).toBeCloseTo(10);
    expect(r.y).toBeCloseTo(20);
    expect(r.w).toBeCloseTo(30);
    expect(r.h).toBeCloseTo(40);
  });

  it("clamps to the crop box", () => {
    const r = toPdfPoints(det(180, 0, 60, 40), page(100, 100, 2, 0, 100, 100));
    expect(r.x).toBeCloseTo(90);
    expect(r.w).toBeCloseTo(10);
  });
});
