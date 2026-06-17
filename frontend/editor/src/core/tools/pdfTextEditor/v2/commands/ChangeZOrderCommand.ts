import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

export type ZOrderMode =
  | "to-front" // top of stack (rendered last, on top of everything)
  | "to-back" // bottom of stack (rendered first, underneath everything)
  | "forward" // swap with the object directly above it
  | "backward"; // swap with the object directly below it

interface InsertAtModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    idx: number,
  ) => boolean;
}

/**
 * Re-order a text run or image within its page's content-stream stack.
 * PDF's painter model means later objects render on top of earlier
 * ones, so "bring to front" = move to the LAST index in the page's
 * object list. The op uses `FPDFPage_RemoveObject` + the newer
 * `FPDFPage_InsertObjectAtIndex` binding (when available). If the
 * binding isn't exposed by this PDFium build the command becomes a
 * no-op (a diagnostic warning is logged on each attempt).
 *
 * Revert restores the object to its original index by the inverse
 * remove+insert. The original index is captured on apply.
 */
export class ChangeZOrderCommand implements Command {
  readonly type = "change-z-order";
  private readonly pageIndex: number;
  private readonly runId: string | null;
  private readonly imageId: string | null;
  private readonly mode: ZOrderMode;
  private prevIndex: number;
  private nextIndex: number;
  private targetPtr: number;

  constructor(opts: {
    pageIndex: number;
    runId?: string;
    imageId?: string;
    mode: ZOrderMode;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId ?? null;
    this.imageId = opts.imageId ?? null;
    this.mode = opts.mode;
    this.prevIndex = -1;
    this.nextIndex = -1;
    this.targetPtr = 0;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const ext = m as unknown as InsertAtModule;
    if (!ext.FPDFPage_InsertObjectAtIndex) {
      if (typeof console !== "undefined") {
        console.warn(
          "[v2.z-order] FPDFPage_InsertObjectAtIndex unavailable - ChangeZOrderCommand is a no-op for this PDFium build",
        );
      }
      return;
    }
    const ptr = this.resolveTargetPtr(page);
    if (!ptr) return;
    this.targetPtr = ptr;
    const total = m.FPDFPage_CountObjects(page.pagePtr);
    let currentIdx = -1;
    for (let i = 0; i < total; i++) {
      if (m.FPDFPage_GetObject(page.pagePtr, i) === ptr) {
        currentIdx = i;
        break;
      }
    }
    if (currentIdx < 0) return;
    let target: number;
    switch (this.mode) {
      case "to-front":
        target = total - 1;
        break;
      case "to-back":
        target = 0;
        break;
      case "forward":
        target = Math.min(total - 1, currentIdx + 1);
        break;
      case "backward":
        target = Math.max(0, currentIdx - 1);
        break;
    }
    if (target === currentIdx) return;
    this.prevIndex = currentIdx;
    this.nextIndex = target;
    m.FPDFPage_RemoveObject(page.pagePtr, ptr);
    ext.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, target);
    page.dirty = true;
  }

  revert(doc: EditorDocument): void {
    if (this.prevIndex < 0 || this.nextIndex < 0 || !this.targetPtr) return;
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const ext = m as unknown as InsertAtModule;
    if (!ext.FPDFPage_InsertObjectAtIndex) return;
    m.FPDFPage_RemoveObject(page.pagePtr, this.targetPtr);
    ext.FPDFPage_InsertObjectAtIndex(
      page.pagePtr,
      this.targetPtr,
      this.prevIndex,
    );
    page.dirty = true;
  }

  private resolveTargetPtr(
    page: import("@app/tools/pdfTextEditor/v2/model/Page").Page,
  ): number {
    if (this.runId) {
      const run = page.runs.find((r) => r.id === this.runId);
      return run?.pdfiumObjPtr ?? 0;
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      return img?.pdfiumObjPtr ?? 0;
    }
    return 0;
  }
}
