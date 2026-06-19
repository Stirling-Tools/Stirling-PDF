import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
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
  }

  get insertedImageId(): string | null {
    return this.createdImageId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
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
    const imageId = `p${page.index}-new-img-${page.images.length}-${newObjPtr}`;
    const created = new ImageObject({
      id: imageId,
      pageIndex: page.index,
      pdfiumObjPtr: newObjPtr,
      bounds: {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      },
      matrix: {
        a: this.width,
        b: 0,
        c: 0,
        d: this.height,
        e: this.x,
        f: this.y,
      },
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
