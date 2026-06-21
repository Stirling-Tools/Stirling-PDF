import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Affine } from "@app/tools/pdfTextEditor/v2/types";

/**
 * Apply an in-place transform to an image: rotate by 90° (CW or CCW),
 * flip horizontally, or flip vertically. All transforms pivot about
 * the image's CURRENT centre so the user's mental model is "the image
 * stays where I see it, just turned/mirrored".
 *
 * Implementation uses `FPDFImageObj_SetMatrix` to write the composed
 * matrix absolutely (not `FPDFPageObj_Transform`'s post-multiply)
 * because the model's `img.matrix` snapshot must match what PDFium
 * has after the op - otherwise re-rotation drifts.
 *
 * Revert restores the pre-apply matrix.
 *
 * Math for the matrix composition: each transform pivots about the
 * image centre (cx, cy) computed from the current matrix's e/f and
 * a/d (the image's 1x1 unit square corners are at (e,f), (e+a, f+b),
 * (e+c, f+d), (e+a+c, f+b+d) - the centre is (e + (a+c)/2,
 * f + (b+d)/2)). The new matrix is:
 *   - rotate90-cw:  [-c -d  a  b  cx+(a+c)/2  cy-(a+c)/2*(?)] - see code
 *   - rotate90-ccw: [ c  d -a -b  ...]
 *   - flip-h:       [-a  b -c  d  cx-(- (a+c)/2)  ...] - mirror image x
 *   - flip-v:       [ a -b  c -d  ...]
 *
 * Rather than memorise these by hand, we apply `T(cx, cy) * Op *
 * T(-cx, -cy)` directly in code (Op is the rotation/flip about the
 * origin) and read the resulting matrix.
 */
export type ImageTransformMode =
  | "rotate-cw"
  | "rotate-ccw"
  | "flip-h"
  | "flip-v";

interface ImageMatrixSetterModule {
  FPDFImageObj_SetMatrix?: (
    obj: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => boolean;
}

export class TransformImageObjectCommand implements Command {
  readonly type = "transform-image";
  private readonly pageIndex: number;
  private readonly imageId: string;
  private readonly mode: ImageTransformMode;
  private prevMatrix: Affine | null;

  constructor(opts: {
    pageIndex: number;
    imageId: string;
    mode: ImageTransformMode;
  }) {
    this.pageIndex = opts.pageIndex;
    this.imageId = opts.imageId;
    this.mode = opts.mode;
    this.prevMatrix = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    if (this.prevMatrix === null) this.prevMatrix = { ...img.matrix };
    const next = composeAboutCentre(img.matrix, this.mode);
    setMatrix(doc, img.pdfiumObjPtr, next);
    img.matrix = next;
    img.bounds = matrixBoundsAxisAligned(next);
    img.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    if (!this.prevMatrix) return;
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    setMatrix(doc, img.pdfiumObjPtr, this.prevMatrix);
    img.matrix = { ...this.prevMatrix };
    img.bounds = matrixBoundsAxisAligned(this.prevMatrix);
    img.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }
}

/**
 * Compose `T(cx, cy) * Op * T(-cx, -cy) * M` where M is the input
 * matrix, Op is the rotation/flip, and (cx, cy) is M's image-centre
 * in page space. Returns the resulting 2D affine.
 *
 * PDF matrices are [a b c d e f] meaning point (x, y) maps to
 *   (a*x + c*y + e, b*x + d*y + f)
 * The image's 1x1 unit square corners therefore project to
 *   (e, f), (e+a, f+b), (e+c, f+d), (e+a+c, f+b+d).
 * Centre = (e + (a+c)/2, f + (b+d)/2).
 */
function composeAboutCentre(m: Affine, mode: ImageTransformMode): Affine {
  const cx = m.e + (m.a + m.c) / 2;
  const cy = m.f + (m.b + m.d) / 2;
  // Op transforms image-space (post-rotation/flip is applied to
  // page-space output). Concretely we compute the operator's 2x2 plus
  // translation, then multiply with M, then offset by (cx, cy) -
  // (centred-op output).
  let oa: number, ob: number, oc: number, od: number;
  switch (mode) {
    case "rotate-ccw":
      oa = 0;
      ob = 1;
      oc = -1;
      od = 0;
      break;
    case "rotate-cw":
      oa = 0;
      ob = -1;
      oc = 1;
      od = 0;
      break;
    case "flip-h":
      oa = -1;
      ob = 0;
      oc = 0;
      od = 1;
      break;
    case "flip-v":
      oa = 1;
      ob = 0;
      oc = 0;
      od = -1;
      break;
  }
  // M' = T(cx, cy) * O * T(-cx, -cy) * M
  // = ((O - I) acts about centre)
  // Concretely: new_a = oa*m.a + oc*m.b
  //             new_b = ob*m.a + od*m.b
  //             new_c = oa*m.c + oc*m.d
  //             new_d = ob*m.c + od*m.d
  //             new_e = oa*(m.e - cx) + oc*(m.f - cy) + cx
  //             new_f = ob*(m.e - cx) + od*(m.f - cy) + cy
  return {
    a: oa * m.a + oc * m.b,
    b: ob * m.a + od * m.b,
    c: oa * m.c + oc * m.d,
    d: ob * m.c + od * m.d,
    e: oa * (m.e - cx) + oc * (m.f - cy) + cx,
    f: ob * (m.e - cx) + od * (m.f - cy) + cy,
  };
}

/**
 * Axis-aligned bounding box of the image's projected 1x1 square
 * under matrix m. Used to refresh `img.bounds` after a non-bounds-
 * preserving transform (rotate, flip can both swap width/height).
 */
function matrixBoundsAxisAligned(m: Affine): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const corners: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [u, v] of corners) {
    xs.push(m.a * u + m.c * v + m.e);
    ys.push(m.b * u + m.d * v + m.f);
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

function setMatrix(doc: EditorDocument, objPtr: number, m: Affine): void {
  const fn = (doc.module as unknown as ImageMatrixSetterModule)
    .FPDFImageObj_SetMatrix;
  if (!fn) return;
  try {
    fn(objPtr, m.a, m.b, m.c, m.d, m.e, m.f);
  } catch {
    /* best-effort */
  }
}
