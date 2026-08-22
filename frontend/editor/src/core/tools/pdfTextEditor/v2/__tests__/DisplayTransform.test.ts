import { describe, it, expect } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

// Unit coverage for the raw-PDF <-> display (CropBox/rotation) transform that
// fixes the spirit-sx positioning bug.

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
    // Ground truth from the real PDFium engine for CropBox [50,20,350,370] and
    // raw user-space point.
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

type Rect = [number, number, number, number];

interface StubPage {
  boundingLTRB?: Rect;
  crop?: Rect;
  media?: Rect;
  rotate?: number;
}

function stubModule(page: StubPage): WrappedPdfiumModule {
  const heap = new Float32Array(256);
  let next = 4;
  const put = (ptr: number, value: number): void => {
    heap[ptr >> 2] = value;
  };
  const mod: Record<string, unknown> = {
    pdfium: {
      wasmExports: {
        malloc: (n: number): number => {
          const p = next;
          next += n;
          return p;
        },
        free: (): void => undefined,
      },
      getValue: (ptr: number, type: string): number =>
        type === "float" ? heap[ptr >> 2] : 0,
    },
    FPDFPage_GetRotation: (): number => page.rotate ?? 0,
  };
  if (page.boundingLTRB) {
    mod.FPDF_GetPageBoundingBox = (_p: number, rect: number): number => {
      page.boundingLTRB!.forEach((v, i) => put(rect + i * 4, v));
      return 1;
    };
  }
  const boxReader =
    (box?: Rect) =>
    (_p: number, l: number, b: number, r: number, t: number): number => {
      if (!box) return 0;
      put(l, box[0]);
      put(b, box[1]);
      put(r, box[2]);
      put(t, box[3]);
      return 1;
    };
  mod.FPDFPage_GetCropBox = boxReader(page.crop);
  mod.FPDFPage_GetMediaBox = boxReader(page.media);
  return mod as unknown as WrappedPdfiumModule;
}

function cropOf(t: DisplayTransform): Rect {
  return [t.cropLeft, t.cropBottom, t.cropWidth, t.cropHeight];
}

describe("DisplayTransform.fromCropAndRotate box hygiene", () => {
  it("normalises reversed corner order (negative extents) instead of inverting", () => {
    const t = DisplayTransform.fromCropAndRotate(
      300,
      400,
      -290,
      -380,
      0,
      290,
      380,
    );
    expect(cropOf(t)).toEqual([10, 20, 290, 380]);
    expect(t.a * t.d - t.b * t.c).toBeCloseTo(1, 9);
    expect(t.apply(10, 20)).toEqual({ x: 0, y: 0 });
    expect(t.apply(300, 400)).toEqual({ x: 290, y: 380 });
  });

  it("normalised reversed corners agree with the equivalent forward box, all rotations", () => {
    for (const r of ROTATIONS) {
      const dw = r % 2 === 0 ? 290 : 380;
      const dh = r % 2 === 0 ? 380 : 290;
      const rev = DisplayTransform.fromCropAndRotate(
        300,
        400,
        -290,
        -380,
        r,
        dw,
        dh,
      );
      const fwd = DisplayTransform.fromCropAndRotate(
        10,
        20,
        290,
        380,
        r,
        dw,
        dh,
      );
      expect(rev.toData()).toEqual(fwd.toData());
    }
  });

  it("falls back to identity for degenerate boxes rather than emitting NaN", () => {
    const degenerate: Array<[number, number, number, number]> = [
      [0, 0, 0, 500],
      [0, 0, 400, 0],
      [0, 0, 0, 0],
      [10, 20, Number.NaN, 380],
      [10, 20, 290, Number.POSITIVE_INFINITY],
    ];
    for (const [cl, cb, cw, ch] of degenerate) {
      const t = DisplayTransform.fromCropAndRotate(cl, cb, cw, ch, 1, 400, 500);
      expect(t.isIdentity).toBe(true);
      expect(cropOf(t)).toEqual([0, 0, 400, 500]);
      expect(t.rotate).toBe(0);
      const d = t.apply(123, 456);
      expect(Number.isNaN(d.x)).toBe(false);
      expect(Number.isNaN(d.y)).toBe(false);
      expect(t.a * t.d - t.b * t.c).toBe(1);
    }
  });

  it("keeps identity finite when the display size itself is not", () => {
    const t = DisplayTransform.identity(Number.NaN, Number.NaN);
    expect(cropOf(t)).toEqual([0, 0, 0, 0]);
    expect(t.displayWidth).toBe(0);
    expect(t.displayHeight).toBe(0);
  });
});

describe("DisplayTransform.fromPage box resolution", () => {
  it("matches PDFium ground truth for the effective page box", () => {
    const cases: Array<{
      name: string;
      page: StubPage;
      display: [number, number];
      expected: Rect;
    }> = [
      {
        name: "MediaBox+CropBox inherited from a grandparent Pages node",
        page: { boundingLTRB: [10, 400, 300, 20] },
        display: [290, 380],
        expected: [10, 20, 290, 380],
      },
      {
        name: "CropBox larger than MediaBox is clipped",
        page: {
          boundingLTRB: [0, 500, 400, 0],
          crop: [-50, -60, 900, 1000],
          media: [0, 0, 400, 500],
        },
        display: [400, 500],
        expected: [0, 0, 400, 500],
      },
      {
        name: "reversed corner order is normalised",
        page: {
          boundingLTRB: [10, 400, 300, 20],
          crop: [300, 400, 10, 20],
          media: [612, 792, 0, 0],
        },
        display: [290, 380],
        expected: [10, 20, 290, 380],
      },
      {
        name: "no boxes anywhere falls back to US Letter",
        page: { boundingLTRB: [0, 792, 612, 0] },
        display: [612, 792],
        expected: [0, 0, 612, 792],
      },
      {
        name: "missing CropBox defaults to MediaBox",
        page: { boundingLTRB: [5, 506, 405, 6], media: [5, 6, 405, 506] },
        display: [400, 500],
        expected: [5, 6, 400, 500],
      },
    ];
    for (const { name, page, display, expected } of cases) {
      const t = DisplayTransform.fromPage(
        stubModule(page),
        1,
        display[0],
        display[1],
      );
      expect(cropOf(t), name).toEqual(expected);
    }
  });

  it("keeps the bounding box in unrotated user space for a rotated page", () => {
    const t = DisplayTransform.fromPage(
      stubModule({
        boundingLTRB: [10, 400, 300, 20],
        crop: [10, 20, 300, 400],
        media: [0, 0, 612, 792],
        rotate: 1,
      }),
      1,
      380,
      290,
    );
    expect(cropOf(t)).toEqual([10, 20, 290, 380]);
    expect(t.rotate).toBe(1);
    expect(t.apply(10, 20)).toEqual({ x: 0, y: 290 });
    expect(t.apply(300, 400)).toEqual({ x: 380, y: 0 });
  });

  it("intersects CropBox with MediaBox when no bounding-box export exists", () => {
    const t = DisplayTransform.fromPage(
      stubModule({ crop: [-50, -60, 900, 1000], media: [0, 0, 400, 500] }),
      1,
      400,
      500,
    );
    expect(cropOf(t)).toEqual([0, 0, 400, 500]);
  });

  it("normalises both boxes before intersecting them", () => {
    const t = DisplayTransform.fromPage(
      stubModule({ crop: [300, 400, 10, 20], media: [612, 792, 0, 0] }),
      1,
      290,
      380,
    );
    expect(cropOf(t)).toEqual([10, 20, 290, 380]);
  });

  it("uses MediaBox when the page carries no CropBox", () => {
    const t = DisplayTransform.fromPage(
      stubModule({ media: [5, 6, 405, 506] }),
      1,
      400,
      500,
    );
    expect(cropOf(t)).toEqual([5, 6, 400, 500]);
  });

  it("uses CropBox when the page carries no MediaBox", () => {
    const t = DisplayTransform.fromPage(
      stubModule({ crop: [5, 6, 405, 506] }),
      1,
      400,
      500,
    );
    expect(cropOf(t)).toEqual([5, 6, 400, 500]);
  });

  it("falls back to MediaBox when CropBox is disjoint from it", () => {
    const t = DisplayTransform.fromPage(
      stubModule({
        boundingLTRB: [0, 0, 0, 0],
        crop: [800, 900, 1000, 1100],
        media: [10, 20, 410, 520],
      }),
      1,
      0,
      0,
    );
    expect(cropOf(t)).toEqual([10, 20, 400, 500]);
    expect(t.a * t.d - t.b * t.c).toBe(1);
  });

  it("falls back to the page-dictionary boxes when the bounding box is degenerate", () => {
    const t = DisplayTransform.fromPage(
      stubModule({
        boundingLTRB: [0, 0, 0, 0],
        crop: [10, 20, 300, 400],
        media: [0, 0, 612, 792],
      }),
      1,
      290,
      380,
    );
    expect(cropOf(t)).toEqual([10, 20, 290, 380]);
  });

  it("falls back to identity when every box read fails", () => {
    const t = DisplayTransform.fromPage(stubModule({}), 1, 612, 792);
    expect(t.isIdentity).toBe(true);
    expect(cropOf(t)).toEqual([0, 0, 612, 792]);
  });

  it("survives throwing PDFium exports", () => {
    const thrower = (): number => {
      throw new Error("wasm trap");
    };
    const base = stubModule({ media: [0, 0, 400, 500] }) as unknown as Record<
      string,
      unknown
    >;
    base.FPDF_GetPageBoundingBox = thrower;
    base.FPDFPage_GetCropBox = thrower;
    base.FPDFPage_GetRotation = thrower;
    const t = DisplayTransform.fromPage(
      base as unknown as WrappedPdfiumModule,
      1,
      400,
      500,
    );
    expect(cropOf(t)).toEqual([0, 0, 400, 500]);
    expect(t.rotate).toBe(0);
  });
});
