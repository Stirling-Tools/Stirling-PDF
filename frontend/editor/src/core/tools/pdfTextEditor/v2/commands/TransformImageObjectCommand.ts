import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Affine } from "@app/tools/pdfTextEditor/v2/types";
import { retargetClipPath } from "@app/tools/pdfTextEditor/v2/util/objectTransform";

// Apply an in-place transform to an image: rotate by 90° (CW or CCW), flip
// horizontally, or flip vertically.
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
    retargetClipPath(doc.module, img.pdfiumObjPtr, img.matrix, next);
    img.matrix = next;
    img.bounds = matrixBoundsAxisAligned(next);
    img.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.prevMatrix) return;
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    setMatrix(doc, img.pdfiumObjPtr, this.prevMatrix);
    retargetClipPath(doc.module, img.pdfiumObjPtr, img.matrix, this.prevMatrix);
    img.matrix = { ...this.prevMatrix };
    img.bounds = matrixBoundsAxisAligned(this.prevMatrix);
    img.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }
}

// Compose `T(cx, cy) * Op * T(-cx, -cy) * M` where M is the input matrix, Op is
// the rotation/flip, and (cx, cy) is M's image-centre in page space.
function composeAboutCentre(m: Affine, mode: ImageTransformMode): Affine {
  const cx = m.e + (m.a + m.c) / 2;
  const cy = m.f + (m.b + m.d) / 2;
  // Op transforms image-space (post-rotation/flip is applied to page-space
  // output).
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
  // M' = T * O * T * M = Concretely: new_a = oa*m.a + oc*m.b new_b = ob*m.a +
  // od*m.b new_c = oa*m.c + oc*m.d new_d = ob*m.c + od*m.d.
  return {
    a: oa * m.a + oc * m.b,
    b: ob * m.a + od * m.b,
    c: oa * m.c + oc * m.d,
    d: ob * m.c + od * m.d,
    e: oa * (m.e - cx) + oc * (m.f - cy) + cx,
    f: ob * (m.e - cx) + od * (m.f - cy) + cy,
  };
}

// Axis-aligned bounding box of the image's projected 1x1 square under matrix m.
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
