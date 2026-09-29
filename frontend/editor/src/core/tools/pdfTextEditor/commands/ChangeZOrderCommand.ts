import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/commands/editTextHelpers";

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

/** One warning per session, not one per apply() - a drag can fire dozens. */
let warnedMissingInsertAt = false;

/** Re-order a text run or image within its page's content-stream stack. */
export class ChangeZOrderCommand implements Command {
  readonly type = "change-z-order";
  private readonly pageIndex: number;
  private readonly runId: string | null;
  private readonly imageId: string | null;
  private readonly mode: ZOrderMode;
  /** Member ptrs at their pre-apply indices, ascending. */
  private memberPrev: Array<{ ptr: number; idx: number }>;

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
    this.memberPrev = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const ext = m as unknown as InsertAtModule;
    if (!ext.FPDFPage_InsertObjectAtIndex) {
      if (typeof console !== "undefined" && !warnedMissingInsertAt) {
        warnedMissingInsertAt = true;
        console.warn(
          "[z-order] FPDFPage_InsertObjectAtIndex unavailable - ChangeZOrderCommand is a no-op for this PDFium build",
        );
      }
      return;
    }
    const ptrs = this.resolveMemberPtrs(page);
    if (ptrs.size === 0) return;
    const total = m.FPDFPage_CountObjects(page.pagePtr);
    // Locate every member at page level, ascending by index. Members
    // nested inside form XObjects don't appear here (known limitation).
    const located: Array<{ ptr: number; idx: number }> = [];
    for (let i = 0; i < total; i++) {
      const o = m.FPDFPage_GetObject(page.pagePtr, i);
      if (ptrs.has(o)) located.push({ ptr: o, idx: i });
    }
    if (located.length === 0 || located.length === total) return;
    const k = located.length;
    const bottomIdx = located[0].idx;
    const topIdx = located[k - 1].idx;
    // The group is only "already in place" when it is contiguous AND at the
    // target edge.
    const contiguous = topIdx - bottomIdx === k - 1;
    let insertAt: number;
    switch (this.mode) {
      case "to-front":
        if (contiguous && topIdx === total - 1) return; // already at front
        insertAt = total - k;
        break;
      case "to-back":
        if (contiguous && bottomIdx === 0) return; // already at back
        insertAt = 0;
        break;
      case "forward":
        // Land just above the object that sat directly above the group's top.
        if (topIdx >= total - 1) return;
        insertAt = topIdx + 2 - k;
        break;
      case "backward":
        // Land just below the object that sat directly below the group's bottom.
        if (bottomIdx <= 0) return;
        insertAt = bottomIdx - 1;
        break;
    }
    this.memberPrev = located;
    for (const { ptr } of located) {
      m.FPDFPage_RemoveObject(page.pagePtr, ptr);
    }
    located.forEach(({ ptr }, j) => {
      ext.FPDFPage_InsertObjectAtIndex!(page.pagePtr, ptr, insertAt + j);
    });
    // markDirty bumps the revision so PageView re-renders the bitmap.
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (this.memberPrev.length === 0) return;
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const ext = m as unknown as InsertAtModule;
    if (!ext.FPDFPage_InsertObjectAtIndex) return;
    for (const { ptr } of this.memberPrev) {
      m.FPDFPage_RemoveObject(page.pagePtr, ptr);
    }
    // Re-inserting in ascending original index order reconstructs the
    // exact pre-apply list.
    for (const { ptr, idx } of this.memberPrev) {
      ext.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, idx);
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  private resolveMemberPtrs(
    page: import("@app/tools/pdfTextEditor/model/Page").Page,
  ): Set<number> {
    if (this.runId) {
      const run = page.runs.find((r) => r.id === this.runId);
      if (!run) return new Set();
      return new Set(collectMemberPtrs(run).filter((p) => p !== 0));
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      return img?.pdfiumObjPtr ? new Set([img.pdfiumObjPtr]) : new Set();
    }
    return new Set();
  }
}
