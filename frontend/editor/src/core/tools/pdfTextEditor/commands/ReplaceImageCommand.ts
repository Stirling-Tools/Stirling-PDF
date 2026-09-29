import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { ImageObject } from "@app/tools/pdfTextEditor/model/ImageObject";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { Affine, PageRect } from "@app/tools/pdfTextEditor/types";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { DecodedImage } from "@app/utils/pdfiumBitmapUtils";
import {
  embedBitmapImageOnPage,
  embedJpegImageOnPage,
} from "@app/utils/pdfiumBitmapUtils";

interface ZOrderModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean;
}

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
  pdfium?: {
    setValue?: (ptr: number, value: number, type: string) => void;
    wasmExports?: {
      malloc?: (size: number) => number;
      free?: (ptr: number) => void;
    };
  };
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
    const m = doc.module;
    // A form-nested original cannot be detached and put back (this build has
    // no FPDFFormObj_InsertObject), so hide it in place instead and draw the
    // replacement at page level using its already-composed page-space matrix.
    const nested = img.containerPtr !== 0;
    if (this.prevMatrix === null || this.prevBounds === null) {
      this.prevObjPtr = img.pdfiumObjPtr;
      this.prevMatrix = { ...img.matrix };
      this.prevBounds = { ...img.bounds };
      this.prevIndex = objectIndex(m, page.pagePtr, this.prevObjPtr);
    }
    const matrix = this.prevMatrix;
    const box = this.prevBounds;
    // Redo: revert only detached the replacement, so re-attach that same
    // object rather than embedding the pixels a second time.
    if (this.nextObjPtr) {
      if (nested) setActive(m, this.prevObjPtr, false);
      else m.FPDFPage_RemoveObject(page.pagePtr, this.prevObjPtr);
      insertObjectAt(m, page.pagePtr, this.nextObjPtr, this.prevIndex);
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
    // Detach only: the old object carries the original pixels for undo, so
    // destroying it would leave this command's undo entry pointing at free memory.
    if (nested) setActive(m, this.prevObjPtr, false);
    else m.FPDFPage_RemoveObject(page.pagePtr, this.prevObjPtr);
    // The embed appended, so without this the replacement jumps to the top.
    if (this.prevIndex >= 0 && supportsInsertAtIndex(m)) {
      m.FPDFPage_RemoveObject(page.pagePtr, objPtr);
      insertObjectAt(m, page.pagePtr, objPtr, this.prevIndex);
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
    else insertObjectAt(m, page.pagePtr, this.prevObjPtr, this.prevIndex);
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

function objectIndex(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
): number {
  const total = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < total; i++) {
    if (m.FPDFPage_GetObject(pagePtr, i) === objPtr) return i;
  }
  return -1;
}

function supportsInsertAtIndex(m: WrappedPdfiumModule): boolean {
  return (
    typeof (m as unknown as ZOrderModule).FPDFPage_InsertObjectAtIndex ===
    "function"
  );
}

/** Re-attach a detached object at `index`, appending when that is unavailable. */
function insertObjectAt(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
  index: number,
): void {
  const insertAt = (m as unknown as ZOrderModule).FPDFPage_InsertObjectAtIndex;
  if (typeof insertAt === "function" && index >= 0) {
    try {
      if (insertAt.call(m, pagePtr, objPtr, index)) return;
    } catch {
      /* fall through to append */
    }
  }
  m.FPDFPage_InsertObject(pagePtr, objPtr);
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
  writeMatrixStruct(mod, objPtr, matrix);
}

/** FS_MATRIX fallback for builds without the scalar `FPDFImageObj_SetMatrix`. */
function writeMatrixStruct(
  mod: MatrixModule,
  objPtr: number,
  matrix: Affine,
): void {
  const setter = mod.FPDFPageObj_SetMatrix;
  const rt = mod.pdfium;
  if (!setter || !rt?.setValue || !rt.wasmExports?.malloc) return;
  const ptr = rt.wasmExports.malloc(6 * 4);
  if (!ptr) return;
  const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  try {
    values.forEach((v, i) => rt.setValue?.(ptr + i * 4, v, "float"));
    setter(objPtr, ptr);
  } catch {
    /* best-effort */
  } finally {
    rt.wasmExports.free?.(ptr);
  }
}
