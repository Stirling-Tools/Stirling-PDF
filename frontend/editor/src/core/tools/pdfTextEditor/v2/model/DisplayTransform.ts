import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/**
 * Maps a page's raw PDF object coordinates (PDFium user space: MediaBox
 * origin, y-up, NOT cropped, NOT rotated) to "display-PDF" space - the
 * coordinate frame of the rendered bitmap (CropBox-cropped + /Rotate-applied)
 * still in PDF points and y-up, with its origin at the visible page's
 * lower-left after rotation.
 *
 * Why this exists: `FPDF_GetPageWidthF/HeightF` and `FPDF_RenderPageBitmap`
 * are CropBox-clipped and rotation-aware, but `FPDFPageObj_GetBounds` /
 * `FPDFText_GetCharBox` return raw MediaBox user space. The editor stores the
 * raw coords (so every command keeps composing in one space and the save path
 * stays untouched) and applies THIS transform only at the screen boundary -
 * the overlay placement (forward) and screen-derived inputs like page-click
 * insert and image drag (inverse). When CropBox==MediaBox and /Rotate==0 the
 * transform is the identity, so the common case is byte-identical to before.
 *
 * The transform is a pure affine `A` (Q = A·P) whose linear part is one of
 * {I, 90, 180, 270 rotation}; only `e`/`f` carry the CropBox origin.
 */
export interface DisplayTransformData {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  cropLeft: number;
  cropBottom: number;
  cropWidth: number;
  cropHeight: number;
  /** PDFium rotation quarter-turns clockwise: 0|1|2|3 (= 0/90/180/270 deg). */
  rotate: number;
  /** Displayed page size in PDF points (rotation-applied; == page width/height). */
  displayWidth: number;
  displayHeight: number;
}

interface CropBoxModule {
  FPDFPage_GetCropBox?: (
    page: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
  ) => number | boolean;
  FPDFPage_GetMediaBox?: (
    page: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
  ) => number | boolean;
  FPDFPage_GetRotation?: (page: number) => number;
}

export class DisplayTransform implements DisplayTransformData {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
  readonly cropLeft: number;
  readonly cropBottom: number;
  readonly cropWidth: number;
  readonly cropHeight: number;
  readonly rotate: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly isIdentity: boolean;

  constructor(d: DisplayTransformData) {
    // Normalise -0 to 0 so identity coefficients compare cleanly (-0 === 0 is
    // true, but Object.is / toEqual distinguish them).
    const nz = (x: number): number => (x === 0 ? 0 : x);
    this.a = nz(d.a);
    this.b = nz(d.b);
    this.c = nz(d.c);
    this.d = nz(d.d);
    this.e = nz(d.e);
    this.f = nz(d.f);
    this.cropLeft = d.cropLeft;
    this.cropBottom = d.cropBottom;
    this.cropWidth = d.cropWidth;
    this.cropHeight = d.cropHeight;
    this.rotate = d.rotate;
    this.displayWidth = d.displayWidth;
    this.displayHeight = d.displayHeight;
    this.isIdentity =
      this.a === 1 &&
      this.b === 0 &&
      this.c === 0 &&
      this.d === 1 &&
      this.e === 0 &&
      this.f === 0;
  }

  /** Identity for a page of the given display size (CropBox==MediaBox, no rotate). */
  static identity(
    displayWidth: number,
    displayHeight: number,
  ): DisplayTransform {
    return new DisplayTransform({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      cropLeft: 0,
      cropBottom: 0,
      cropWidth: displayWidth,
      cropHeight: displayHeight,
      rotate: 0,
      displayWidth,
      displayHeight,
    });
  }

  /** Reconstruct from the serializable plain-data shape (e.g. a PageSnapshot). */
  static fromData(d: DisplayTransformData): DisplayTransform {
    return new DisplayTransform(d);
  }

  toData(): DisplayTransformData {
    return {
      a: this.a,
      b: this.b,
      c: this.c,
      d: this.d,
      e: this.e,
      f: this.f,
      cropLeft: this.cropLeft,
      cropBottom: this.cropBottom,
      cropWidth: this.cropWidth,
      cropHeight: this.cropHeight,
      rotate: this.rotate,
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight,
    };
  }

  /** Raw PDF point -> display-PDF point (y-up). */
  apply(px: number, py: number): { x: number; y: number } {
    return {
      x: this.a * px + this.c * py + this.e,
      y: this.b * px + this.d * py + this.f,
    };
  }

  /** Display-PDF point -> raw PDF point (inverse of apply). */
  invert(xd: number, yd: number): { x: number; y: number } {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return { x: xd, y: yd };
    const ia = this.d / det;
    const ib = -this.b / det;
    const ic = -this.c / det;
    const id = this.a / det;
    const ie = -(ia * this.e + ic * this.f);
    const iff = -(ib * this.e + id * this.f);
    return { x: ia * xd + ic * yd + ie, y: ib * xd + id * yd + iff };
  }

  /** Raw direction vector -> display direction (linear part only, no translation). */
  applyVector(vx: number, vy: number): { x: number; y: number } {
    return { x: this.a * vx + this.c * vy, y: this.b * vx + this.d * vy };
  }

  /** Display direction vector -> raw direction (inverse linear part only). */
  invertVector(vx: number, vy: number): { x: number; y: number } {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return { x: vx, y: vy };
    const ia = this.d / det;
    const ib = -this.b / det;
    const ic = -this.c / det;
    const id = this.a / det;
    return { x: ia * vx + ic * vy, y: ib * vx + id * vy };
  }

  /**
   * Build the transform for a page by reading its CropBox + rotation from
   * PDFium. Falls back to identity (today's behaviour) when neither box is
   * readable, so a malformed page never throws.
   */
  static fromPage(
    m: WrappedPdfiumModule,
    pagePtr: number,
    displayWidth: number,
    displayHeight: number,
  ): DisplayTransform {
    const mod = m as unknown as CropBoxModule;
    const box = readBox(m, mod, pagePtr);
    if (!box) return DisplayTransform.identity(displayWidth, displayHeight);
    const cl = Math.min(box.left, box.right);
    const cb = Math.min(box.bottom, box.top);
    const cw = Math.abs(box.right - box.left);
    const ch = Math.abs(box.top - box.bottom);
    let rotate = 0;
    try {
      rotate = (mod.FPDFPage_GetRotation?.(pagePtr) ?? 0) & 3;
    } catch {
      /* keep default rotate=0 on read failure */
    }
    return DisplayTransform.fromCropAndRotate(
      cl,
      cb,
      cw,
      ch,
      rotate,
      displayWidth,
      displayHeight,
    );
  }

  /**
   * Pure constructor from CropBox extents + rotation (exposed for tests).
   * `rotate` is quarter-turns clockwise (0..3). Affine coefficients per the
   * four cases; only e/f carry the crop origin so cl=cb=0,rotate=0 => identity.
   */
  static fromCropAndRotate(
    cl: number,
    cb: number,
    cw: number,
    ch: number,
    rotate: number,
    displayWidth: number,
    displayHeight: number,
  ): DisplayTransform {
    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      e = -cl,
      f = -cb;
    switch (rotate & 3) {
      case 0:
        a = 1;
        b = 0;
        c = 0;
        d = 1;
        e = -cl;
        f = -cb;
        break;
      case 1: // 90 CW - proper rotation (det +1), verified vs PDFium ground truth
        a = 0;
        b = -1;
        c = 1;
        d = 0;
        e = -cb;
        f = cw + cl;
        break;
      case 2: // 180
        a = -1;
        b = 0;
        c = 0;
        d = -1;
        e = cw + cl;
        f = ch + cb;
        break;
      case 3: // 270 CW - proper rotation (det +1), verified vs PDFium ground truth
        a = 0;
        b = 1;
        c = -1;
        d = 0;
        e = ch + cb;
        f = -cl;
        break;
    }
    return new DisplayTransform({
      a,
      b,
      c,
      d,
      e,
      f,
      cropLeft: cl,
      cropBottom: cb,
      cropWidth: cw,
      cropHeight: ch,
      rotate: rotate & 3,
      displayWidth,
      displayHeight,
    });
  }
}

/** Read CropBox (preferred) or MediaBox into {left,bottom,right,top}, or null. */
function readBox(
  m: WrappedPdfiumModule,
  mod: CropBoxModule,
  pagePtr: number,
): { left: number; bottom: number; right: number; top: number } | null {
  const exports = m.pdfium.wasmExports as unknown as {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
  const l = exports.malloc(4);
  const b = exports.malloc(4);
  const r = exports.malloc(4);
  const t = exports.malloc(4);
  try {
    const read = (
      fn?: (
        p: number,
        l: number,
        b: number,
        r: number,
        t: number,
      ) => number | boolean,
    ): boolean => {
      if (!fn) return false;
      try {
        return !!fn(pagePtr, l, b, r, t);
      } catch {
        return false;
      }
    };
    if (!read(mod.FPDFPage_GetCropBox) && !read(mod.FPDFPage_GetMediaBox)) {
      return null;
    }
    return {
      left: m.pdfium.getValue(l, "float"),
      bottom: m.pdfium.getValue(b, "float"),
      right: m.pdfium.getValue(r, "float"),
      top: m.pdfium.getValue(t, "float"),
    };
  } finally {
    exports.free(l);
    exports.free(b);
    exports.free(r);
    exports.free(t);
  }
}
