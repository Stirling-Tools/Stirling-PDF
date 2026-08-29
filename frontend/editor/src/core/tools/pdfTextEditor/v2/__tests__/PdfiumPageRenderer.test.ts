import { describe, expect, it } from "vitest";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumPageRenderer";

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
