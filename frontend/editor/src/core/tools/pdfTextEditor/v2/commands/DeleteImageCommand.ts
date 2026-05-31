import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { ImageObjectSnapshot } from "@app/tools/pdfTextEditor/v2/types";

/**
 * Remove an image object from a page. The PDFium object is detached via
 * `FPDFPage_RemoveObject` but kept alive so `revert` can re-attach it.
 */
export class DeleteImageCommand implements Command {
  readonly type = "delete-image";
  private readonly pageIndex: number;
  private readonly imageId: string;
  private snapshot: ImageObjectSnapshot | null;
  private cachedObjPtr: number;
  /**
   * Index in the page's object list at the moment of deletion. PDFium's
   * `FPDFPage_InsertObject` appends to the end of the list, which puts
   * the restored object on top of the z-order. We don't expose an
   * "insert at index" API on PDFium directly - on revert we re-insert
   * via the experimental Z-order helper if available, otherwise we
   * accept the end-of-list placement and document it.
   */
  private originalIndex: number;

  constructor(opts: { pageIndex: number; imageId: string }) {
    this.pageIndex = opts.pageIndex;
    this.imageId = opts.imageId;
    this.snapshot = null;
    this.cachedObjPtr = 0;
    this.originalIndex = -1;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const img = page.findImage(this.imageId);
    if (!img) return;
    if (this.snapshot === null) {
      this.snapshot = img.snapshot();
      this.cachedObjPtr = img.pdfiumObjPtr;
      // Record the original index so revert can re-insert in place.
      const total = doc.module.FPDFPage_CountObjects(page.pagePtr);
      let foundIdx = -1;
      for (let i = 0; i < total; i++) {
        if (
          doc.module.FPDFPage_GetObject(page.pagePtr, i) === img.pdfiumObjPtr
        ) {
          foundIdx = i;
          break;
        }
      }
      this.originalIndex = foundIdx;
    }
    if (img.pdfiumObjPtr) {
      doc.module.FPDFPage_RemoveObject(page.pagePtr, img.pdfiumObjPtr);
    }
    page.setImages(page.images.filter((i) => i.id !== img.id));
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    if (!this.snapshot || !this.cachedObjPtr) return;
    const page = doc.page(this.pageIndex);
    const m = doc.module as unknown as {
      FPDFPage_InsertObjectAtIndex?: (
        page: number,
        obj: number,
        index: number,
      ) => boolean;
      FPDFPage_InsertObject: (page: number, obj: number) => void;
    };
    const insertAt = m.FPDFPage_InsertObjectAtIndex;
    let inserted = false;
    if (typeof insertAt === "function" && this.originalIndex >= 0) {
      try {
        inserted = insertAt.call(
          m,
          page.pagePtr,
          this.cachedObjPtr,
          this.originalIndex,
        );
      } catch {
        inserted = false;
      }
    }
    if (!inserted) {
      // Fallback: re-insert at end. We then bubble it back down to its
      // original z-order by rotating subsequent objects. This is O(N) in
      // the page's object count but is rarely the hot path (a user
      // pressing Reset on a magazine page).
      doc.module.FPDFPage_InsertObject(page.pagePtr, this.cachedObjPtr);
      if (this.originalIndex >= 0) {
        const total = doc.module.FPDFPage_CountObjects(page.pagePtr);
        const lastIdx = total - 1;
        // Step the newly-inserted object down by removing+reinserting
        // the objects that should be ABOVE it. Each iteration moves
        // the target object effectively one step lower in z-order.
        // This works because FPDFPage_InsertObject appends to the end.
        for (let i = this.originalIndex; i < lastIdx; i++) {
          const ptr = doc.module.FPDFPage_GetObject(
            page.pagePtr,
            this.originalIndex,
          );
          if (!ptr || ptr === this.cachedObjPtr) break;
          doc.module.FPDFPage_RemoveObject(page.pagePtr, ptr);
          doc.module.FPDFPage_InsertObject(page.pagePtr, ptr);
        }
      }
    }
    const restored = new ImageObject({
      ...this.snapshot,
      pdfiumObjPtr: this.cachedObjPtr,
    });
    // Insert back into the images array at the original position when
    // we know it, so any UI ordering matches the visual stacking.
    const images = [...page.images];
    if (this.originalIndex >= 0 && this.originalIndex <= images.length) {
      images.splice(this.originalIndex, 0, restored);
    } else {
      images.push(restored);
    }
    page.setImages(images);
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }
}
