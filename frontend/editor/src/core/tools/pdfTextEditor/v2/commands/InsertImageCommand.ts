import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { Affine } from "@app/tools/pdfTextEditor/v2/types";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  counterPageRotation,
  rotateObjectAbout,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { imageMatrixBounds } from "@app/tools/pdfTextEditor/v2/model/affine";
import {
  embedBitmapImageOnPage,
  embedJpegImageOnPage,
} from "@app/utils/pdfiumBitmapUtils";

/**
 * Insert a decoded raster image onto a page at the given lower-left
 * coordinate, scaled to `(width, height)` PDF points. The decode runs
 * in the React layer so this command stays synchronous.
 */
export class InsertImageCommand implements Command {
  readonly type = "insert-image";
  private readonly pageIndex: number;
  private readonly rgba: Uint8ClampedArray;
  private readonly pixelWidth: number;
  private readonly pixelHeight: number;
  private readonly x: number;
  private readonly y: number;
  private readonly width: number;
  private readonly height: number;
  /** Original JPEG bytes; when present, embedded as-is (DCTDecode) to keep the file small. */
  private readonly jpegBytes?: Uint8Array;
  private createdImageId: string | null;
  private createdObjPtr: number;
  /** Matrix written on first embed; reused so redo re-inserts the same object. */
  private appliedMatrix: Affine | null;

  constructor(opts: {
    pageIndex: number;
    rgba: Uint8ClampedArray;
    pixelWidth: number;
    pixelHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
    jpegBytes?: Uint8Array;
  }) {
    this.pageIndex = opts.pageIndex;
    this.rgba = opts.rgba;
    this.pixelWidth = opts.pixelWidth;
    this.pixelHeight = opts.pixelHeight;
    this.x = opts.x;
    this.y = opts.y;
    this.width = opts.width;
    this.height = opts.height;
    this.jpegBytes = opts.jpegBytes;
    this.createdImageId = null;
    this.createdObjPtr = 0;
    this.appliedMatrix = null;
  }

  get insertedImageId(): string | null {
    return this.createdImageId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    // Redo: re-insert the SAME object detached by revert instead of re-embedding.
    // The object was only detached (not destroyed), so this is safe and leak-free.
    if (this.createdObjPtr) {
      m.FPDFPage_InsertObject(page.pagePtr, this.createdObjPtr);
      if (this.createdImageId) {
        const restored = new ImageObject({
          id: this.createdImageId,
          pageIndex: page.index,
          pdfiumObjPtr: this.createdObjPtr,
          bounds: {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
          },
          matrix: this.appliedMatrix ?? {
            a: this.width,
            b: 0,
            c: 0,
            d: this.height,
            e: this.x,
            f: this.y,
          },
        });
        page.setImages([...page.images, restored]);
      }
      page.markDirty();
      page.markNeedsGenerate();
      return;
    }
    // JPEG sources embed as-is (DCTDecode) to keep the output small; fall back
    // to the RGBA bitmap path if the JPEG API is unavailable or the load fails.
    // The embed helper returns the new object pointer directly. Looking it up
    // afterwards via FPDFPage_GetObject failed because the content stream
    // isn't regenerated until save, so the object index wasn't yet resolvable.
    let newObjPtr = this.jpegBytes
      ? embedJpegImageOnPage(
          m,
          doc.docPtr,
          page.pagePtr,
          this.jpegBytes,
          this.x,
          this.y,
          this.width,
          this.height,
        )
      : 0;
    if (!newObjPtr) {
      newObjPtr = embedBitmapImageOnPage(
        m,
        doc.docPtr,
        page.pagePtr,
        {
          rgba: new Uint8Array(
            this.rgba.buffer,
            this.rgba.byteOffset,
            this.rgba.byteLength,
          ),
          width: this.pixelWidth,
          height: this.pixelHeight,
        },
        this.x,
        this.y,
        this.width,
        this.height,
      );
    }
    if (!newObjPtr) return;
    // On a /Rotate page, counter-rotate about the centre so the image reads
    // upright (mirrors InsertTextCommand); no-op on an unrotated page.
    const rot = counterPageRotation(page.display.rotate);
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    if (rot) rotateObjectAbout(m, newObjPtr, cx, cy, rot.cos, rot.sin);
    const matrix: Affine = rot
      ? readMatrix(m, newObjPtr)
      : {
          a: this.width,
          b: 0,
          c: 0,
          d: this.height,
          e: this.x,
          f: this.y,
        };
    this.appliedMatrix = matrix;
    const imageId = `p${page.index}-new-img-${page.images.length}-${newObjPtr}`;
    const created = new ImageObject({
      id: imageId,
      pageIndex: page.index,
      pdfiumObjPtr: newObjPtr,
      // On a /Rotate page the counter-rotated object's real AABB has
      // swapped width/height vs the pre-rotation rect - storing the raw
      // rect misplaced the selection handles until reload.
      bounds: rot
        ? imageMatrixBounds(matrix)
        : {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
          },
      matrix,
    });
    page.setImages([...page.images, created]);
    page.markDirty();
    page.markNeedsGenerate();
    this.createdImageId = imageId;
    this.createdObjPtr = newObjPtr;
  }

  revert(doc: EditorDocument): void {
    if (!this.createdObjPtr) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_RemoveObject(page.pagePtr, this.createdObjPtr);
    if (this.createdImageId) {
      page.setImages(page.images.filter((i) => i.id !== this.createdImageId));
    }
    page.markDirty();
    page.markNeedsGenerate();
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
