import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { Affine, PageRect } from "@editor/tools/pdfTextEditor/types";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { DecodedImage } from "@editor/utils/pdfiumBitmapUtils";
import {
  embedBitmapImageOnPage,
  embedJpegImageOnPage,
} from "@editor/utils/pdfiumBitmapUtils";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";
import { copyTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  indexedInsertOf,
  insertPageObjectAt,
} from "@editor/tools/pdfTextEditor/util/insertPageObject";
import { pageObjectIndex } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { clipHidesImage } from "@editor/tools/pdfTextEditor/util/imageClip";

interface MatrixModule {
  FPDFImageObj_SetMatrix?: (
    obj: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => boolean;
  FPDFPageObj_SetMatrix?: (obj: number, matrix: number) => boolean;
}

/** Swap an image's pixels but keep its matrix, so it fills the same box. */
interface ActivityModule {
  FPDFPageObj_SetIsActive?: (obj: number, active: boolean) => boolean;
}

// Hiding beats detaching for an object the page does not own: it is a pure
// state flip, so undo is exact and nothing changes hands.
function setActive(
  m: EditorDocument["module"],
  ptr: number,
  active: boolean,
): void {
  if (!ptr) return;
  try {
    (m as unknown as ActivityModule).FPDFPageObj_SetIsActive?.(ptr, active);
  } catch {
    /* best-effort */
  }
}

export class ReplaceImageCommand implements Command {
  readonly type = "replace-image";
  private readonly pageIndex: number;
  private readonly imageId: string;
  private readonly image: DecodedImage;
  private readonly jpegBytes?: Uint8Array;
  private prevObjPtr: number;
  private prevMatrix: Affine | null;
  private prevBounds: PageRect | null;
  private prevIndex: number;
  private nextObjPtr: number;

  constructor(opts: {
    pageIndex: number;
    imageId: string;
    image: DecodedImage;
    jpegBytes?: Uint8Array;
  }) {
    this.pageIndex = opts.pageIndex;
    this.imageId = opts.imageId;
    this.image = opts.image;
    this.jpegBytes = opts.jpegBytes;
    this.prevObjPtr = 0;
    this.prevMatrix = null;
    this.prevBounds = null;
    this.prevIndex = -1;
    this.nextObjPtr = 0;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img || !img.pdfiumObjPtr) return;
    // The replacement is a new object, and PDFium cannot give an object a
    // clip, so it would show what the original's clip hides.
    if (clipHidesImage(img)) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.error.replaceClippedImage",
            "Can't replace this image: it is cropped, and the replacement would show the parts the crop hides.",
          ),
        ),
      );
    }
    const m = doc.module;
    // A form-nested original cannot be detached and put back (this build has
    // no FPDFFormObj_InsertObject), so hide it in place instead and draw the
    // replacement at page level using its already-composed page-space matrix.
    const nested = img.containerPtr !== 0;
    if (this.prevMatrix === null || this.prevBounds === null) {
      this.prevObjPtr = img.pdfiumObjPtr;
      this.prevMatrix = { ...img.matrix };
      this.prevBounds = { ...img.bounds };
      this.prevIndex = pageObjectIndex(m, page.pagePtr, this.prevObjPtr);
    }
    const matrix = this.prevMatrix;
    const box = this.prevBounds;
    // Redo: revert only detached the replacement, so re-attach that same
    // object rather than embedding the pixels a second time.
    if (this.nextObjPtr) {
      if (nested) setActive(m, this.prevObjPtr, false);
      else m.FPDFPage_RemoveObject(page.pagePtr, this.prevObjPtr);
      insertPageObjectAt(m, page.pagePtr, this.nextObjPtr, this.prevIndex);
      this.adopt(page, img, this.nextObjPtr);
      return;
    }
    let objPtr = this.jpegBytes
      ? embedJpegImageOnPage(
          m,
          doc.docPtr,
          page.pagePtr,
          this.jpegBytes,
          box.x,
          box.y,
          box.width,
          box.height,
        )
      : 0;
    if (!objPtr) {
      objPtr = embedBitmapImageOnPage(
        m,
        doc.docPtr,
        page.pagePtr,
        this.image,
        box.x,
        box.y,
        box.width,
        box.height,
      );
    }
    // Embedding failed - leave the page exactly as it was.
    if (!objPtr) return;
    // The embed helpers write an axis-aligned (w,0,0,h,x,y) box, which flips
    // the image on a rotated page; the captured matrix is the truth here.
    setImageMatrix(m, objPtr, matrix);
    // Untagged, the new image drops out of the structure tree and the Figure
    // describing the old one points at nothing. A form's MCIDs are not the
    // page's, so a nested original's tags cannot move to page level.
    if (!nested) copyTagMarks(m, doc.docPtr, this.prevObjPtr, objPtr);
    // Detach only: the old object carries the original pixels for undo, so
    // destroying it would leave this command's undo entry pointing at free memory.
    if (nested) setActive(m, this.prevObjPtr, false);
    else m.FPDFPage_RemoveObject(page.pagePtr, this.prevObjPtr);
    // The embed appended, so without this the replacement jumps to the top.
    if (this.prevIndex >= 0 && indexedInsertOf(m)) {
      m.FPDFPage_RemoveObject(page.pagePtr, objPtr);
      insertPageObjectAt(m, page.pagePtr, objPtr, this.prevIndex);
    }
    this.nextObjPtr = objPtr;
    this.adopt(page, img, objPtr);
  }

  revert(doc: EditorDocument): void {
    if (!this.nextObjPtr || !this.prevObjPtr) return;
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img) return;
    const m = doc.module;
    // Detach only again: the replacement is what redo re-attaches.
    m.FPDFPage_RemoveObject(page.pagePtr, this.nextObjPtr);
    if (img.containerPtr) setActive(m, this.prevObjPtr, true);
    else insertPageObjectAt(m, page.pagePtr, this.prevObjPtr, this.prevIndex);
    this.adopt(page, img, this.prevObjPtr);
  }

  private adopt(page: Page, img: ImageObject, objPtr: number): void {
    img.pdfiumObjPtr = objPtr;
    if (this.prevMatrix) img.matrix = { ...this.prevMatrix };
    if (this.prevBounds) img.bounds = { ...this.prevBounds };
    img.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }
}

function setImageMatrix(
  m: WrappedPdfiumModule,
  objPtr: number,
  matrix: Affine,
): void {
  const mod = m as unknown as MatrixModule;
  const direct = mod.FPDFImageObj_SetMatrix;
  if (typeof direct === "function") {
    try {
      const ok = direct.call(
        m,
        objPtr,
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.e,
        matrix.f,
      );
      if (ok) return;
    } catch {
      /* fall through to the struct setter */
    }
  }
  writeMatrixStruct(m, objPtr, matrix);
}

/** FS_MATRIX fallback for builds without the scalar `FPDFImageObj_SetMatrix`. */
function writeMatrixStruct(
  m: WrappedPdfiumModule,
  objPtr: number,
  matrix: Affine,
): void {
  const setter = (m as unknown as MatrixModule).FPDFPageObj_SetMatrix;
  if (!setter || !m.pdfium.setValue) return;
  const ptr = scratchPtr(m, SCRATCH.imageMatrix, 6 * 4);
  if (!ptr) return;
  const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  try {
    values.forEach((v, i) => m.pdfium.setValue(ptr + i * 4, v, "float"));
    setter(objPtr, ptr);
  } catch {
    /* best-effort */
  }
}
