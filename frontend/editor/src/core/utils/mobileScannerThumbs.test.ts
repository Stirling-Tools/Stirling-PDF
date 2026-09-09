/**
 * Unit tests for fitThumbs, which sizes the mobile scanner's thumbnail strip.
 *
 * The page deliberately never scrolls, so the strip shrinks to fit instead.
 * These pin the invariants that keep it from swallowing the camera preview.
 */

import { describe, test, expect } from "vitest";
import { fitThumbs, THUMB_SIZES } from "@app/utils/mobileScannerThumbs";

const TOTALS = [1, 3, 9, 21, 40];
const VIEWPORTS = [
  { width: 240, height: 320 },
  { width: 1024, height: 1366 },
];

describe("fitThumbs", () => {
  test("a zero viewport falls back to the largest thumb and no height cap", () => {
    expect(fitThumbs(3, 0, 0)).toEqual({
      thumbSize: THUMB_SIZES[0],
      stripMaxHeight: undefined,
    });
    expect(fitThumbs(3, 375, 0)).toEqual({
      thumbSize: THUMB_SIZES[0],
      stripMaxHeight: undefined,
    });
    expect(fitThumbs(3, 0, 812)).toEqual({
      thumbSize: THUMB_SIZES[0],
      stripMaxHeight: undefined,
    });
  });

  test("stripMaxHeight never exceeds 45% of the viewport height", () => {
    for (const { width, height } of VIEWPORTS) {
      for (const total of TOTALS) {
        const { stripMaxHeight } = fitThumbs(total, width, height);
        expect(stripMaxHeight).toBeLessThanOrEqual(height * 0.45);
      }
    }
  });

  test("thumbSize never grows as more images are added", () => {
    for (const { width, height } of VIEWPORTS) {
      let previous = Number.POSITIVE_INFINITY;
      for (let total = 1; total <= 60; total++) {
        const { thumbSize } = fitThumbs(total, width, height);
        expect(thumbSize).toBeLessThanOrEqual(previous);
        previous = thumbSize;
      }
    }
  });

  test("thumbSize is always one of the allowed sizes", () => {
    for (const { width, height } of VIEWPORTS) {
      for (const total of TOTALS) {
        expect(THUMB_SIZES).toContain(
          fitThumbs(total, width, height).thumbSize,
        );
      }
    }
  });
});
