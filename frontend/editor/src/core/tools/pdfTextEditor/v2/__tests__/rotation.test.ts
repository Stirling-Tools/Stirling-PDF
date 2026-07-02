import { describe, it, expect } from "vitest";
import {
  rotationFromMatrix,
  counterPageRotation,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

describe("rotationFromMatrix", () => {
  it("returns undefined for upright text (identity / pure scale)", () => {
    expect(rotationFromMatrix({ a: 1, b: 0 })).toBeUndefined();
    expect(rotationFromMatrix({ a: 12, b: 0 })).toBeUndefined(); // scale only
  });

  it("extracts normalised cos/sin for a 30deg run, scale-independent", () => {
    const r = rotationFromMatrix({ a: 0.866, b: 0.5 })!;
    expect(r.cos).toBeCloseTo(0.866, 2);
    expect(r.sin).toBeCloseTo(0.5, 2);
    // Same angle at 2x scale → same normalised rotation.
    const r2 = rotationFromMatrix({ a: 1.732, b: 1.0 })!;
    expect(r2.cos).toBeCloseTo(0.866, 2);
    expect(r2.sin).toBeCloseTo(0.5, 2);
  });

  it("flags a horizontal flip (negative a) as a rotation", () => {
    expect(rotationFromMatrix({ a: -1, b: 0 })).toBeDefined();
  });

  it("returns undefined for a degenerate zero matrix", () => {
    expect(rotationFromMatrix({ a: 0, b: 0 })).toBeUndefined();
  });
});

describe("counterPageRotation", () => {
  it("is undefined for an unrotated page", () => {
    expect(counterPageRotation(0)).toBeUndefined();
    expect(counterPageRotation(4)).toBeUndefined();
  });

  it("counter-rotates 90/180/270 so new text reads upright", () => {
    expect(counterPageRotation(1)).toEqual({ cos: 0, sin: 1 }); // +90 CCW
    expect(counterPageRotation(2)).toEqual({ cos: -1, sin: 0 }); // 180
    expect(counterPageRotation(3)).toEqual({ cos: 0, sin: -1 }); // -90
  });

  it("normalises out-of-range / negative quarter-turns", () => {
    expect(counterPageRotation(5)).toEqual({ cos: 0, sin: 1 }); // 5 % 4 == 1
    expect(counterPageRotation(-3)).toEqual({ cos: 0, sin: 1 }); // -3 -> 1
  });
});
