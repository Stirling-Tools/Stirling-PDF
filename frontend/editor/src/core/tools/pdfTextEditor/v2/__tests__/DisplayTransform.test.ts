import { describe, it, expect } from "vitest";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

/**
 * Unit coverage for the raw-PDF <-> display (CropBox/rotation) transform that
 * fixes the spirit-sx positioning bug. Pure math, no PDFium. Pins the
 * rotation/crop affine, the apply/invert round-trip, and - critically - the
 * identity (CropBox==MediaBox, /Rotate==0) byte-exact pass-through so the
 * common case cannot drift.
 */

const CROP = { cl: 36, cb: 72, cw: 540, ch: 720 };
const ROTATIONS = [0, 1, 2, 3];

function mk(rotate: number): DisplayTransform {
  const { cl, cb, cw, ch } = CROP;
  // displayWidth/Height swap for 90/270.
  const dw = rotate % 2 === 0 ? cw : ch;
  const dh = rotate % 2 === 0 ? ch : cw;
  return DisplayTransform.fromCropAndRotate(cl, cb, cw, ch, rotate, dw, dh);
}

describe("DisplayTransform", () => {
  it("identity for CropBox==MediaBox, Rotate 0 (byte-exact pass-through)", () => {
    const t = DisplayTransform.fromCropAndRotate(0, 0, 600, 800, 0, 600, 800);
    expect(t.isIdentity).toBe(true);
    expect([t.a, t.b, t.c, t.d, t.e, t.f]).toEqual([1, 0, 0, 1, 0, 0]);
    for (const [px, py] of [
      [0, 0],
      [123.4, 567.8],
      [600, 800],
    ]) {
      expect(t.apply(px, py)).toEqual({ x: px, y: py });
      expect(t.invert(px, py)).toEqual({ x: px, y: py });
    }
  });

  it("apply/invert round-trip to identity for all rotations + non-zero crop", () => {
    for (const r of ROTATIONS) {
      const t = mk(r);
      for (const [px, py] of [
        [36, 72],
        [300, 500],
        [576, 792],
        [100.25, 240.75],
      ]) {
        const d = t.apply(px, py);
        const back = t.invert(d.x, d.y);
        expect(back.x).toBeCloseTo(px, 6);
        expect(back.y).toBeCloseTo(py, 6);
      }
    }
  });

  it("displayed-size invariant: the CropBox maps to a (Wd,Hd) AABB anchored at the origin, swapped for 90/270", () => {
    const { cl, cb, cw, ch } = CROP;
    const corners: Array<[number, number]> = [
      [cl, cb],
      [cl + cw, cb],
      [cl, cb + ch],
      [cl + cw, cb + ch],
    ];
    for (const r of ROTATIONS) {
      const t = mk(r);
      const ds = corners.map(([px, py]) => t.apply(px, py));
      const w =
        Math.max(...ds.map((d) => d.x)) - Math.min(...ds.map((d) => d.x));
      const h =
        Math.max(...ds.map((d) => d.y)) - Math.min(...ds.map((d) => d.y));
      const expW = r % 2 === 0 ? cw : ch;
      const expH = r % 2 === 0 ? ch : cw;
      expect(w).toBeCloseTo(expW, 6);
      expect(h).toBeCloseTo(expH, 6);
      // The displayed AABB must lie in [0,Wd] x [0,Hd] (origin at lower-left).
      expect(Math.min(...ds.map((d) => d.x))).toBeCloseTo(0, 6);
      expect(Math.min(...ds.map((d) => d.y))).toBeCloseTo(0, 6);
    }
  });

  it("matches PDFium ground truth for all rotations (pins orientation; det +1)", () => {
    // Ground truth from the real PDFium engine (FPDF_PageToDevice -> display-PDF
    // y-up) for CropBox [50,20,350,370] and raw user-space point (60,350).
    // This is what catches a 90/270 reflection (det -1) flip.
    const c = { cl: 50, cb: 20, cw: 300, ch: 350 };
    const cases: Array<[number, [number, number]]> = [
      [0, [10, 330]],
      [1, [330, 290]],
      [2, [290, 20]],
      [3, [20, 10]],
    ];
    for (const [rot, [ex, ey]] of cases) {
      const dw = rot % 2 === 0 ? c.cw : c.ch;
      const dh = rot % 2 === 0 ? c.ch : c.cw;
      const t = DisplayTransform.fromCropAndRotate(
        c.cl,
        c.cb,
        c.cw,
        c.ch,
        rot,
        dw,
        dh,
      );
      // Proper rotation/reflection-free: determinant must be +1.
      expect(t.a * t.d - t.b * t.c).toBeCloseTo(1, 9);
      const d = t.apply(60, 350);
      expect(d.x).toBeCloseTo(ex, 4);
      expect(d.y).toBeCloseTo(ey, 4);
    }
  });

  it("rotate 0 is a pure crop translate", () => {
    const t = mk(0);
    expect(t.apply(CROP.cl + 10, CROP.cb + 20)).toEqual({ x: 10, y: 20 });
  });

  it("applyVector/invertVector round-trip and ignore translation", () => {
    for (const r of ROTATIONS) {
      const t = mk(r);
      const v = t.applyVector(5, -3);
      const back = t.invertVector(v.x, v.y);
      expect(back.x).toBeCloseTo(5, 6);
      expect(back.y).toBeCloseTo(-3, 6);
      // identity-rotate keeps the vector as-is.
      if (r === 0) expect(v).toEqual({ x: 5, y: -3 });
    }
  });

  it("fromData / toData are lossless", () => {
    const t = mk(3);
    const r = DisplayTransform.fromData(t.toData());
    expect(r.toData()).toEqual(t.toData());
    expect(r.apply(100, 200)).toEqual(t.apply(100, 200));
  });
});
