import { describe, expect, test } from "vitest";
import {
  POINT_TO_UNIT,
  calculateCalibratedScale,
  calculateScaleFactor,
  convertUnit,
  deriveRatioFromFactor,
  parsePresetRatio,
} from "@app/utils/measurementUtils";

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
});
