import { describe, expect, it } from "vitest";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";

// A4 in PDF points.
const A4_W = 595;
const A4_H = 842;

describe("PdfiumPageRenderer.deviceScale", () => {
  it("multiplies the zoom scale by the display ratio", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 2)).toBeCloseTo(3);
  });

  it("treats a 1x display as a plain zoom scale", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 1)).toBeCloseTo(1.5);
  });

  it("never renders BELOW the zoom scale on a sub-1x ratio", () => {
    // Browser zoomed out below 100%: upscaling would soften, so hold at 1x.
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1.5, 0.8)).toBeCloseTo(
      1.5,
    );
  });

  it("caps the ratio at 3 - beyond that is memory, not sharpness", () => {
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 1, 4)).toBeCloseTo(3);
  });

  it("clamps a poster page to the pixel budget", () => {
    // 36x48in poster: 2592x3456pt. Unclamped 4x zoom on a 2x display would be
    // a 573MB bitmap; the budget holds one page under ~128MB of RGBA.
    const scale = PdfiumPageRenderer.deviceScale(2592, 3456, 4, 2);
    const { width, height } = PdfiumPageRenderer.rasterSize(2592, 3456, scale);
    expect(width * height).toBeLessThanOrEqual(32_000_000 * 1.01);
    expect(scale).toBeLessThan(8);
    expect(scale).toBeGreaterThan(1);
  });

  it("keeps ordinary pages essentially unclamped at max zoom on 2x", () => {
    // A4 at 8x sits right on the pixel budget, so the cap shaves ~0.01.
    expect(PdfiumPageRenderer.deviceScale(A4_W, A4_H, 4, 2)).toBeCloseTo(8, 1);
  });
});

describe("PdfiumPageRenderer.rasterBudget", () => {
  it("renders an ordinary page at the requested scale", () => {
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 2)).toEqual({
      width: 1190,
      height: 1684,
    });
  });

  it("holds a giant page inside the pixel budget, keeping its shape", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      100_000,
      100_000,
      1,
    );
    expect(width * height).toBeLessThanOrEqual(32_000_000);
    expect(width / height).toBeCloseTo(1, 2);
  });

  it("caps a single axis past the dimension limit", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(200_000, 10, 1);
    expect(width).toBeLessThanOrEqual(32_768);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("falls back to 1x when the scale is not a positive finite number", () => {
    const plain = PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 1);
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, Number.NaN)).toEqual(
      plain,
    );
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, 0)).toEqual(plain);
    expect(PdfiumPageRenderer.rasterBudget(A4_W, A4_H, -3)).toEqual(plain);
  });

  it("falls back to a unit page when the dimensions are not finite", () => {
    const { width, height } = PdfiumPageRenderer.rasterBudget(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2,
    );
    expect(Number.isFinite(width)).toBe(true);
    expect(Number.isFinite(height)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
