import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Affine, PageRect } from "@app/tools/pdfTextEditor/v2/types";
import {
  imageMatrixBounds,
  remapImageMatrix,
} from "@app/tools/pdfTextEditor/v2/model/affine";

/**
 * Set an image object's transform to an absolute target.
 *
 * The new matrix is derived by remapping the image's DISPLAY-space AABB from
 * its previous extent to `nextBounds` while preserving the orientation baked
 * into the previous matrix (see {@link remapImageMatrix}). This keeps a moved
 * image upright and same-sized even on /Rotate / CropBox pages, where the raw
 * AABB's width/height are swapped relative to what the user sees - the earlier
 * "rebuild as axis-aligned `(w,0,0,h,x,y)` then counter-rotate" approach swapped
 * the image's width/height and flipped it on every move of a rotated page.
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
    let prevBounds = this.prevBounds;
    let prevMatrix = this.prevMatrix;
    if (prevBounds === null || prevMatrix === null) {
      prevBounds = { ...img.bounds };
      prevMatrix = { ...img.matrix };
      this.prevBounds = prevBounds;
      this.prevMatrix = prevMatrix;
    }
    // Remap the image's display AABB from prevBounds -> nextBounds while keeping
    // the orientation/aspect of prevMatrix, then write the result absolutely.
    // Reduces to the axis-aligned (w,0,0,h,x,y) placement on an unrotated page.
    const next = remapImageMatrix(
      prevMatrix,
      prevBounds,
      this.nextBounds,
      page.display,
    );
    setMatrix(doc, img.pdfiumObjPtr, next);
    img.matrix = next;
    img.bounds = imageMatrixBounds(next);
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

function setMatrix(doc: EditorDocument, objPtr: number, m: Affine): void {
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
    fn(objPtr, m.a, m.b, m.c, m.d, m.e, m.f);
  } catch {
    /* best-effort */
  }
}
