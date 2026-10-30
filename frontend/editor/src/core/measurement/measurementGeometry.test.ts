import { describe, expect, it } from "vitest";
import { polygonArea, polygonPerimeter, rectanglePoints } from "../../features/measurement/utils/measurementArea";
import { calculateMeasurementRows } from "../../features/measurement/utils/measurementRows";
import type { Measurement } from "../../features/measurement/utils/measurementTypes";

const p = (x: number, y: number, pageIndex = 0) => ({ x, y, pageIndex });

describe("Measurement geometry", () => {
  it("calculates rectangle area and perimeter regardless of diagonal direction", () => {
    for (const corners of [rectanglePoints(p(0, 0), p(3, 4)), rectanglePoints(p(3, 4), p(0, 0))]) {
      expect(polygonArea(corners)).toBe(12);
      expect(polygonPerimeter(corners)).toBe(14);
    }
  });
  it("rejects geometry crossing PDF pages", () => {
    expect(rectanglePoints(p(0, 0), p(3, 4, 1))).toEqual([]);
    expect(polygonArea([p(0, 0), p(3, 0), p(0, 4, 1)])).toBe(0);
    expect(polygonPerimeter([p(0, 0), p(3, 0, 1)])).toBe(0);
  });
  it("returns zero area for fewer than three points", () => {
    expect(polygonArea([p(0, 0), p(1, 1)])).toBe(0);
  });
  it("calculates calibrated length and surface in meters", () => {
    const measurements: Measurement[] = [
      { id: "line", kind: "length", start: p(0, 0), end: p(3, 4), groupId: "g" },
      { id: "area", kind: "rectangle", start: p(0, 0), end: p(3, 4), points: rectanglePoints(p(0, 0), p(3, 4)), groupId: "g" },
    ];
    const rows = calculateMeasurementRows(measurements, [{ id: "g", name: "Rom", color: "#123456" }], { factor: 2, ratio: 100, unit: "m" }, "Generelt");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: "Rom 1", area: false, meters: 10, squareMeters: 0 });
    expect(rows[1]).toMatchObject({ label: "Rom 2", area: true, meters: 28, squareMeters: 48 });
  });
  it("does not invent calibrated values without a valid scale", () => {
    const rows = calculateMeasurementRows([{ id: "line", start: p(0, 0), end: p(3, 4) }], [], null, "Generelt");
    expect(rows[0].meters).toBe(0);
  });
});
