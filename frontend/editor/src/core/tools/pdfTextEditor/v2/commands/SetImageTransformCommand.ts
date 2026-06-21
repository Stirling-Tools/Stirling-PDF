import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Affine, PageRect } from "@app/tools/pdfTextEditor/v2/types";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  counterPageRotation,
  rotateObjectAbout,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Set an image object's transform to an absolute target.
 *
 * PDFium image objects encode their on-page size in the matrix's a/d
 * components (image space is 1x1 units; the matrix scales+translates
 * into PDF space). Setting `(a, b, c, d, e, f) = (width, 0, 0, height,
 * x, y)` places the image with its lower-left at `(x, y)` sized
 * `(width, height)`.
 *
 * Using `FPDFImageObj_SetMatrix` (absolute) instead of
 * `FPDFPageObj_Transform` (post-multiply) avoids the "teleport" bug
 * where drag-from-non-bottom-right resizes left the Rnd UI and the
 * PDFium model disagreeing on where the image actually was.
 *
 * Revert restores the matrix and bounds the command captured on first
 * apply.
 */
export class SetImageTransformCommand implements Command {
  readonly type = "set-image-transform";
  private readonly pageIndex: number;
  private readonly imageId: string;
  private readonly nextBounds: PageRect;
  private prevBounds: PageRect | null;
  private prevMatrix: Affine | null;

  constructor(opts: {
    pageIndex: number;
    imageId: string;
    nextBounds: PageRect;
  }) {
    this.pageIndex = opts.pageIndex;
    this.imageId = opts.imageId;
    this.nextBounds = opts.nextBounds;
    this.prevBounds = null;
    this.prevMatrix = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    if (this.prevBounds === null) {
      this.prevBounds = { ...img.bounds };
      this.prevMatrix = { ...img.matrix };
    }
    setMatrix(doc, img.pdfiumObjPtr, this.nextBounds);
    img.bounds = { ...this.nextBounds };
    // On a /Rotate page, counter-rotate about the new centre so the image stays
    // upright; no-op (byte-identical) otherwise. Limitation: pre-existing image
    // rotation/shear on an unrotated page is flattened (UI reports only an AABB).
    const m = doc.module;
    const rot = counterPageRotation(page.display.rotate);
    if (rot) {
      const cx = this.nextBounds.x + this.nextBounds.width / 2;
      const cy = this.nextBounds.y + this.nextBounds.height / 2;
      rotateObjectAbout(m, img.pdfiumObjPtr, cx, cy, rot.cos, rot.sin);
      img.matrix = readMatrix(m, img.pdfiumObjPtr);
    } else {
      img.matrix = {
        a: this.nextBounds.width,
        b: 0,
        c: 0,
        d: this.nextBounds.height,
        e: this.nextBounds.x,
        f: this.nextBounds.y,
      };
    }
    img.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.prevBounds || !this.prevMatrix) return;
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    // Restore the captured matrix exactly (preserves any rotation /
    // shear that wasn't expressed in the simple bounds form).
    const m = doc.module;
    const fn = (
      m as unknown as {
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
    ).FPDFImageObj_SetMatrix;
    if (!fn) return;
    try {
      fn(
        img.pdfiumObjPtr,
        this.prevMatrix.a,
        this.prevMatrix.b,
        this.prevMatrix.c,
        this.prevMatrix.d,
        this.prevMatrix.e,
        this.prevMatrix.f,
      );
    } catch {
      /* best-effort */
    }
    img.bounds = { ...this.prevBounds };
    img.matrix = { ...this.prevMatrix };
    img.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }
}

function setMatrix(
  doc: EditorDocument,
  objPtr: number,
  bounds: PageRect,
): void {
  const fn = (
    doc.module as unknown as {
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
  ).FPDFImageObj_SetMatrix;
  if (!fn) return;
  try {
    fn(objPtr, bounds.width, 0, 0, bounds.height, bounds.x, bounds.y);
  } catch {
    /* best-effort */
  }
}

/** Read an object's current matrix so the model stays in lock-step with PDFium. */
function readMatrix(m: WrappedPdfiumModule, objPtr: number): Affine {
  // FS_MATRIX: { a, b, c, d, e, f } as floats.
  const buf = m.pdfium.wasmExports.malloc(6 * 4);
  try {
    const ok = m.FPDFPageObj_GetMatrix(objPtr, buf);
    if (!ok) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    return {
      a: m.pdfium.getValue(buf, "float"),
      b: m.pdfium.getValue(buf + 4, "float"),
      c: m.pdfium.getValue(buf + 8, "float"),
      d: m.pdfium.getValue(buf + 12, "float"),
      e: m.pdfium.getValue(buf + 16, "float"),
      f: m.pdfium.getValue(buf + 20, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}
