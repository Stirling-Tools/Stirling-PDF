import { describe, it, expect } from "vitest";
import {
  composeAffine,
  invertAffine,
  imageMatrixBounds,
  remapImageMatrix,
  transformRectAABB,
} from "@app/tools/pdfTextEditor/v2/model/affine";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import type { Affine, PageRect } from "@app/tools/pdfTextEditor/v2/types";

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function expectAffineClose(got: Affine, want: Affine): void {
  for (const k of ["a", "b", "c", "d", "e", "f"] as const) {
    expect(got[k]).toBeCloseTo(want[k], 4);
  }
}

describe("affine helpers", () => {
  it("invertAffine inverts a rotation+translation, identity on singular", () => {
    const t: Affine = { a: 0, b: -1, c: 1, d: 0, e: 5, f: 7 };
    const round = composeAffine(t, invertAffine(t));
    expectAffineClose(round, IDENTITY);
    // Degenerate (zero linear part) -> identity rather than NaN.
    expectAffineClose(
      invertAffine({ a: 0, b: 0, c: 0, d: 0, e: 3, f: 4 }),
      IDENTITY,
    );
  });

  it("imageMatrixBounds is the AABB of the unit square under the matrix", () => {
    // 90deg-rotated 200x100 image -> 100 wide x 200 tall AABB.
    const m: Affine = { a: 0, b: 200, c: -100, d: 0, e: 562, f: 100 };
    const b = imageMatrixBounds(m);
    expect(b).toEqual({ x: 462, y: 100, width: 100, height: 200 });
  });
});

describe("remapImageMatrix - unrotated page stays byte-identical", () => {
  const display = IDENTITY; // CropBox==MediaBox, /Rotate 0

  it("moving an axis-aligned image only translates it", () => {
    const prev: Affine = { a: 100, b: 0, c: 0, d: 50, e: 10, f: 20 };
    const prevBounds: PageRect = { x: 10, y: 20, width: 100, height: 50 };
    const nextBounds: PageRect = { x: 60, y: 80, width: 100, height: 50 };
    expectAffineClose(remapImageMatrix(prev, prevBounds, nextBounds, display), {
      a: 100,
      b: 0,
      c: 0,
      d: 50,
      e: 60,
      f: 80,
    });
  });

  it("resizing an axis-aligned image rebuilds (w,0,0,h,x,y)", () => {
    const prev: Affine = { a: 100, b: 0, c: 0, d: 50, e: 10, f: 20 };
    const prevBounds: PageRect = { x: 10, y: 20, width: 100, height: 50 };
    const nextBounds: PageRect = { x: 10, y: 20, width: 200, height: 100 };
    expectAffineClose(remapImageMatrix(prev, prevBounds, nextBounds, display), {
      a: 200,
      b: 0,
      c: 0,
      d: 100,
      e: 10,
      f: 20,
    });
  });
});

describe("remapImageMatrix - /Rotate 90 landscape page preserves orientation", () => {
  // Portrait MediaBox 612x792 displayed landscape via /Rotate 90.
  const display = DisplayTransform.fromCropAndRotate(
    0,
    0,
    612,
    792,
    1,
    792,
    612,
  );
  // An image that displays upright as 200 wide x 100 tall has this raw matrix
  // (rotated 90deg in raw space) and a 100x200 raw AABB.
  const prev: Affine = { a: 0, b: 200, c: -100, d: 0, e: 562, f: 100 };
  const prevBounds: PageRect = { x: 462, y: 100, width: 100, height: 200 };

  it("a no-op move returns the original matrix unchanged (no flip)", () => {
    const next = remapImageMatrix(prev, prevBounds, prevBounds, display);
    expectAffineClose(next, prev);
  });

  it("a move keeps the image's linear part (orientation + aspect) intact", () => {
    // Drag the displayed image by (+30, +40) px in display space. That is a
    // raw-space translation of A^-1 * (30,40) = (-40, 30).
    const nextBounds: PageRect = { x: 422, y: 130, width: 100, height: 200 };
    const next = remapImageMatrix(prev, prevBounds, nextBounds, display);
    // Linear part is byte-stable -> the image is NOT re-oriented by a move.
    expect(next.a).toBeCloseTo(prev.a, 4);
    expect(next.b).toBeCloseTo(prev.b, 4);
    expect(next.c).toBeCloseTo(prev.c, 4);
    expect(next.d).toBeCloseTo(prev.d, 4);
    expect(next.e).toBeCloseTo(522, 4);
    expect(next.f).toBeCloseTo(130, 4);

    // And the image still DISPLAYS as 200 wide x 100 tall (landscape upright),
    // not the swapped 100x200 the old counter-rotate path produced.
    const dispBox = transformRectAABB(display, imageMatrixBounds(next));
    expect(dispBox.width).toBeCloseTo(200, 3);
    expect(dispBox.height).toBeCloseTo(100, 3);
  });

  it("a uniform resize scales display footprint without swapping w/h", () => {
    // Halve the displayed size: 200x100 -> 100x50, anchored at same display
    // lower-left. The displayed AABB stays landscape (wider than tall).
    const half = remapImageMatrix(
      prev,
      prevBounds,
      { x: 512, y: 100, width: 50, height: 100 },
      display,
    );
    const dispBox = transformRectAABB(display, imageMatrixBounds(half));
    expect(dispBox.width).toBeCloseTo(100, 3);
    expect(dispBox.height).toBeCloseTo(50, 3);
  });
});
