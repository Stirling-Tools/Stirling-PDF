import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/** Maps a page's raw PDF object coordinates to "display-PDF" space. */
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

type BoxReader = (
  page: number,
  left: number,
  bottom: number,
  right: number,
  top: number,
) => number | boolean;

interface CropBoxModule {
  FPDFPage_GetCropBox?: BoxReader;
  FPDFPage_GetMediaBox?: BoxReader;
  FPDF_GetPageBoundingBox?: (page: number, rect: number) => number | boolean;
  FPDFPage_GetRotation?: (page: number) => number;
}

interface PageBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
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
    const dw = Number.isFinite(displayWidth) ? displayWidth : 0;
    const dh = Number.isFinite(displayHeight) ? displayHeight : 0;
    return new DisplayTransform({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
      cropLeft: 0,
      cropBottom: 0,
      cropWidth: dw,
      cropHeight: dh,
      rotate: 0,
      displayWidth: dw,
      displayHeight: dh,
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

  // Build the transform for a page by reading its CropBox + rotation from
  // PDFium.
  static fromPage(
    m: WrappedPdfiumModule,
    pagePtr: number,
    displayWidth: number,
    displayHeight: number,
  ): DisplayTransform {
    const mod = m as unknown as CropBoxModule;
    const box = readBox(m, mod, pagePtr);
    if (!box) return DisplayTransform.identity(displayWidth, displayHeight);
    const rotate = callSafely(
      () => (mod.FPDFPage_GetRotation?.(pagePtr) ?? 0) & 3,
      0,
    );
    return DisplayTransform.fromCropAndRotate(
      box.left,
      box.bottom,
      box.right - box.left,
      box.top - box.bottom,
      rotate,
      displayWidth,
      displayHeight,
    );
  }

  // Pure constructor from CropBox extents + rotation (exposed for tests).
  // `rotate` is quarter-turns clockwise (0..3).
  static fromCropAndRotate(
    cl: number,
    cb: number,
    cw: number,
    ch: number,
    rotate: number,
    displayWidth: number,
    displayHeight: number,
  ): DisplayTransform {
    const box = normaliseBox(cl, cb, cl + cw, cb + ch);
    if (!box) return DisplayTransform.identity(displayWidth, displayHeight);
    const left = box.left;
    const bottom = box.bottom;
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      e = -left,
      f = -bottom;
    switch (rotate & 3) {
      case 0:
        a = 1;
        b = 0;
        c = 0;
        d = 1;
        e = -left;
        f = -bottom;
        break;
      case 1: // 90 CW - proper rotation (det +1), verified vs PDFium ground truth
        a = 0;
        b = -1;
        c = 1;
        d = 0;
        e = -bottom;
        f = width + left;
        break;
      case 2: // 180
        a = -1;
        b = 0;
        c = 0;
        d = -1;
        e = width + left;
        f = height + bottom;
        break;
      case 3: // 270 CW - proper rotation (det +1), verified vs PDFium ground truth
        a = 0;
        b = 1;
        c = -1;
        d = 0;
        e = height + bottom;
        f = -left;
        break;
    }
    return new DisplayTransform({
      a,
      b,
      c,
      d,
      e,
      f,
      cropLeft: left,
      cropBottom: bottom,
      cropWidth: width,
      cropHeight: height,
      rotate: rotate & 3,
      displayWidth,
      displayHeight,
    });
  }
}

function callSafely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

function boxOrNull(
  left: number,
  bottom: number,
  right: number,
  top: number,
): PageBox | null {
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(right) ||
    !Number.isFinite(top)
  ) {
    return null;
  }
  if (right - left <= 0 || top - bottom <= 0) return null;
  return { left, bottom, right, top };
}

function normaliseBox(
  left: number,
  bottom: number,
  right: number,
  top: number,
): PageBox | null {
  return boxOrNull(
    Math.min(left, right),
    Math.min(bottom, top),
    Math.max(left, right),
    Math.max(bottom, top),
  );
}

function intersectBoxes(a: PageBox, b: PageBox): PageBox | null {
  return boxOrNull(
    Math.max(a.left, b.left),
    Math.max(a.bottom, b.bottom),
    Math.min(a.right, b.right),
    Math.min(a.top, b.top),
  );
}

function readBox(
  m: WrappedPdfiumModule,
  mod: CropBoxModule,
  pagePtr: number,
): PageBox | null {
  const exports = m.pdfium.wasmExports as unknown as {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
  const buf = exports.malloc(16);
  if (!buf) return null;
  try {
    const slot = (i: number): number => m.pdfium.getValue(buf + i * 4, "float");
    const bounding = mod.FPDF_GetPageBoundingBox;
    if (bounding) {
      const ok = callSafely(() => !!bounding(pagePtr, buf), false);
      const effective = ok
        ? normaliseBox(slot(0), slot(3), slot(2), slot(1))
        : null;
      if (effective) return effective;
    }
    const readRect = (fn?: BoxReader): PageBox | null => {
      if (!fn) return null;
      const ok = callSafely(
        () => !!fn(pagePtr, buf, buf + 4, buf + 8, buf + 12),
        false,
      );
      if (!ok) return null;
      return normaliseBox(slot(0), slot(1), slot(2), slot(3));
    };
    const crop = readRect(mod.FPDFPage_GetCropBox);
    const media = readRect(mod.FPDFPage_GetMediaBox);
    if (crop && media) return intersectBoxes(crop, media) ?? media;
    return crop ?? media;
  } finally {
    exports.free(buf);
  }
}
