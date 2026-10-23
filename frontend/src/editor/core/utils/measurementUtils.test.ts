// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  POINT_TO_UNIT,
  calculateCalibratedScale,
  calculateScaleFactor,
  convertUnit,
  deriveRatioFromFactor,
  formatArea,
  formatLength,
  fromViewPoint,
  normalizeFileScales,
  normalizeMeasurement,
  parsePresetRatio,
  pathLength,
  polygonArea,
  resolvePageScale,
  resolveScale,
  toViewPoint,
  type PageView,
} from "@editor/utils/measurementUtils";
import { viewAngle } from "@editor/utils/measurementDescription";
import type {
  FileMeasureScales,
  MeasureScale,
  PageMeasureScales,
  PagePoint,
} from "@editor/utils/measurementTypes";

const pt = (x: number, y: number, pageIndex = 0): PagePoint => ({
  pageIndex,
  x,
  y,
});

const AUTO = { displayUnit: "auto", precision: "auto" } as const;
const ONE_TO_100_M: MeasureScale = {
  factor: calculateScaleFactor(100, "m"),
  ratio: 100,
  unit: "m",
};

describe("measurementUtils", () => {
  describe("calculateScaleFactor", () => {
    test("calculates real-world units per PDF point from a scale ratio", () => {
      expect(calculateScaleFactor(100, "m")).toBeCloseTo(POINT_TO_UNIT.m * 100);
      expect(calculateScaleFactor(50, " cm ")).toBeCloseTo(
        POINT_TO_UNIT.cm * 50,
      );
      expect(calculateScaleFactor(12, "FT")).toBeCloseTo(POINT_TO_UNIT.ft * 12);
    });

    test("rejects invalid scale ratios", () => {
      expect(() => calculateScaleFactor(0, "m")).toThrow("Invalid scale ratio");
      expect(() => calculateScaleFactor(-1, "m")).toThrow(
        "Invalid scale ratio",
      );
      expect(() => calculateScaleFactor(Number.NaN, "m")).toThrow(
        "Invalid scale ratio",
      );
      expect(() => calculateScaleFactor(Number.POSITIVE_INFINITY, "m")).toThrow(
        "Invalid scale ratio",
      );
    });

    test("rejects unsupported units", () => {
      expect(() => calculateScaleFactor(100, "px")).toThrow("Unsupported unit");
    });
  });

  describe("convertUnit", () => {
    test("converts representative metric and imperial values", () => {
      expect(convertUnit(1, "m", "cm")).toBeCloseTo(100);
      expect(convertUnit(12, "in", "ft")).toBeCloseTo(1);
      expect(convertUnit(3, "ft", "yd")).toBeCloseTo(1);
      expect(convertUnit(1, "ft", "m")).toBeCloseTo(0.3048);
    });

    test("returns null for invalid values or unsupported units", () => {
      expect(convertUnit(Number.NaN, "m", "cm")).toBeNull();
      expect(convertUnit(Number.POSITIVE_INFINITY, "m", "cm")).toBeNull();
      expect(convertUnit(1, "px", "cm")).toBeNull();
      expect(convertUnit(1, "m", "px")).toBeNull();
    });
  });

  describe("parsePresetRatio", () => {
    test("parses supported preset ratios", () => {
      expect(parsePresetRatio("1:5")).toBe(5);
      expect(parsePresetRatio("1:100")).toBe(100);
      expect(parsePresetRatio(" 1 : 150 ")).toBe(150);
    });

    test("returns null for malformed or non-positive presets", () => {
      expect(parsePresetRatio("2:100")).toBeNull();
      expect(parsePresetRatio("1:0")).toBeNull();
      expect(parsePresetRatio("1:-10")).toBeNull();
      expect(parsePresetRatio("1:not-a-number")).toBeNull();
      expect(parsePresetRatio("bad")).toBeNull();
      expect(parsePresetRatio("1:10:20")).toBeNull();
    });
  });

  describe("deriveRatioFromFactor", () => {
    test("recovers the scale ratio from a factor and unit", () => {
      const factor = calculateScaleFactor(100, "m");

      expect(deriveRatioFromFactor(factor, "m")).toBeCloseTo(100);
    });

    test("returns null for invalid factors or unsupported units", () => {
      expect(deriveRatioFromFactor(0, "m")).toBeNull();
      expect(deriveRatioFromFactor(-1, "m")).toBeNull();
      expect(deriveRatioFromFactor(Number.NaN, "m")).toBeNull();
      expect(deriveRatioFromFactor(1, "px")).toBeNull();
    });
  });

  describe("calculateCalibratedScale", () => {
    test("calculates a calibrated scale from a known physical distance", () => {
      const scale = calculateCalibratedScale(72, 1, "in");

      expect(scale.factor).toBeCloseTo(POINT_TO_UNIT.in);
      expect(scale.ratio).toBeCloseTo(1);
      expect(scale.unit).toBe("in");
    });

    test("calculates architectural ratios for metric calibration", () => {
      const scale = calculateCalibratedScale(72, 0.0254, "m");

      expect(scale.factor).toBeCloseTo(POINT_TO_UNIT.m);
      expect(scale.ratio).toBeCloseTo(1);
      expect(scale.unit).toBe("m");
    });

    test("rejects invalid calibration inputs", () => {
      expect(() => calculateCalibratedScale(0, 1, "m")).toThrow(
        "Invalid PDF distance",
      );
      expect(() => calculateCalibratedScale(72, 0, "m")).toThrow(
        "Invalid real-world distance",
      );
      expect(() => calculateCalibratedScale(72, 1, "px")).toThrow(
        "Unsupported unit",
      );
    });
  });

  describe("geometry", () => {
    test("sums open and closed path lengths", () => {
      const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
      expect(pathLength(square, false)).toBe(30);
      expect(pathLength(square, true)).toBe(40);
    });

    test("computes polygon area regardless of winding", () => {
      const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
      expect(polygonArea(square)).toBe(100);
      expect(polygonArea([...square].reverse())).toBe(100);
      expect(polygonArea([pt(0, 0), pt(4, 0), pt(0, 3)])).toBe(6);
      expect(polygonArea([pt(0, 0), pt(1, 1)])).toBe(0);
    });
  });

  describe("formatting", () => {
    test("formats a scaled length in the scale's unit by default", () => {
      // 1 inch on paper at 1:100 is 2.54 m.
      expect(formatLength(72, ONE_TO_100_M, AUTO)).toBe("2.540 m");
    });

    test("converts to a chosen unit and precision", () => {
      expect(
        formatLength(72, ONE_TO_100_M, { displayUnit: "cm", precision: 1 }),
      ).toBe("254.0 cm");
      expect(
        formatLength(72, ONE_TO_100_M, { displayUnit: "ft", precision: 2 }),
      ).toBe("8.33 ft");
    });

    test("falls back to paper size without a scale", () => {
      expect(formatLength(72, null, AUTO)).toBe("25.4 mm");
      expect(formatLength(72, null, { displayUnit: "in", precision: 2 })).toBe(
        "1.00 in",
      );
    });

    test("squares the unit conversion for areas", () => {
      // A 1 in square at 1:100 is 2.54 m on a side.
      expect(
        formatArea(72 * 72, ONE_TO_100_M, { displayUnit: "m", precision: 2 }),
      ).toBe("6.45 m²");
      expect(
        formatArea(72 * 72, ONE_TO_100_M, { displayUnit: "cm", precision: 0 }),
      ).toBe("64516 cm²");
    });
  });

  describe("normalizeMeasurement", () => {
    test("upgrades the legacy two-point shape to a distance", () => {
      expect(
        normalizeMeasurement({ id: "a", start: pt(1, 2), end: pt(3, 4) }),
      ).toEqual({ id: "a", kind: "distance", points: [pt(1, 2), pt(3, 4)] });
    });

    test("keeps valid styling and drops invalid styling", () => {
      const parsed = normalizeMeasurement({
        id: "b",
        kind: "area",
        points: [pt(0, 0), pt(1, 0), pt(1, 1)],
        label: "Kitchen",
        color: "red",
        strokeWidth: 99,
      });
      expect(parsed).toEqual({
        id: "b",
        kind: "area",
        points: [pt(0, 0), pt(1, 0), pt(1, 1)],
        label: "Kitchen",
      });
    });

    test("rejects too few points and cross-page measurements", () => {
      expect(
        normalizeMeasurement({
          id: "c",
          kind: "area",
          points: [pt(0, 0), pt(1, 1)],
        }),
      ).toBeNull();
      expect(
        normalizeMeasurement({
          id: "d",
          kind: "perimeter",
          points: [pt(0, 0), pt(1, 1, 1)],
        }),
      ).toBeNull();
    });
  });

  describe("scales", () => {
    test("reads the legacy whole-file scale", () => {
      expect(normalizeFileScales(ONE_TO_100_M)).toEqual({
        defaultScale: ONE_TO_100_M,
        pageScales: {},
      });
      expect(normalizeFileScales(null)).toEqual({
        defaultScale: null,
        pageScales: {},
      });
    });

    test("prefers a page scale, then the file scale, then the PDF's", () => {
      const pageScale: MeasureScale = { ...ONE_TO_100_M, ratio: 50 };
      const embeddedScale: MeasureScale = { ...ONE_TO_100_M, ratio: 20 };
      const embedded: PageMeasureScales = new Map([
        [
          0,
          {
            pageHeight: 800,
            viewports: [{ bbox: null, scale: embeddedScale }],
          },
        ],
      ]);
      const scales: FileMeasureScales = {
        defaultScale: ONE_TO_100_M,
        pageScales: { 1: pageScale },
      };

      expect(resolveScale(1, pt(0, 0), scales, embedded)).toBe(pageScale);
      expect(resolveScale(0, pt(0, 0), scales, embedded)).toBe(ONE_TO_100_M);
      expect(
        resolveScale(
          0,
          pt(0, 0),
          { defaultScale: null, pageScales: {} },
          embedded,
        ),
      ).toBe(embeddedScale);
    });
  });

  describe("view space", () => {
    const portrait = (rotation: PageView["rotation"]): PageView => ({
      width: 600,
      height: 800,
      rotation,
    });

    test("matches the viewer's 90-degree clockwise turn", () => {
      // The page's top-left corner ends up at the top-right on screen.
      expect(toViewPoint(pt(0, 0), portrait(1))).toEqual({ x: 800, y: 0 });
      expect(toViewPoint(pt(600, 0), portrait(1))).toEqual({ x: 800, y: 600 });
    });

    test("round-trips at every rotation", () => {
      for (const rotation of [0, 1, 2, 3] as const) {
        const view = portrait(rotation);
        const back = fromViewPoint(toViewPoint(pt(123, 456, 2), view), view, 2);
        expect(back.x).toBeCloseTo(123);
        expect(back.y).toBeCloseTo(456);
        expect(back.pageIndex).toBe(2);
      }
    });

    test("reports angles as seen on a rotated page", () => {
      // Vertical on the unrotated page is horizontal once turned 90 degrees.
      const a = pt(100, 100);
      const b = pt(100, 300);
      expect(viewAngle(a, b, null)).toBeCloseTo(-90);
      expect(Math.abs(viewAngle(a, b, portrait(1)))).toBeCloseTo(180);
    });
  });

  describe("resolvePageScale", () => {
    test("counts a PDF scale that covers only part of the page", () => {
      const regionScale: MeasureScale = { ...ONE_TO_100_M, ratio: 50 };
      const embedded: PageMeasureScales = new Map([
        [
          0,
          {
            pageHeight: 800,
            viewports: [{ bbox: [100, 100, 300, 300], scale: regionScale }],
          },
        ],
      ]);
      const none: FileMeasureScales = { defaultScale: null, pageScales: {} };
      expect(resolveScale(0, pt(0, 0), none, embedded)).toBeNull();
      expect(resolvePageScale(0, none, embedded)).toBe(regionScale);
      expect(
        resolvePageScale(
          0,
          { defaultScale: ONE_TO_100_M, pageScales: {} },
          embedded,
        ),
      ).toBe(ONE_TO_100_M);
    });
  });
});
