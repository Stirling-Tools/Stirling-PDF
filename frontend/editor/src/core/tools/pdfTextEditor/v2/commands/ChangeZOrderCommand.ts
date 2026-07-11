import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

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
 * Merged/paragraph runs are backed by MULTIPLE page objects; the whole
 * member group moves as a contiguous block (relative paint order kept).
 * Moving only the anchor lifted one word and left the rest behind.
 *
 * Revert restores every member to its original index by the inverse
 * remove+insert. The original indices are captured on apply.
 */
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
      if (typeof console !== "undefined") {
        console.warn(
          "[v2.z-order] FPDFPage_InsertObjectAtIndex unavailable - ChangeZOrderCommand is a no-op for this PDFium build",
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
    // target edge - a member group is not always content-stream-contiguous
    // (spatial grouping can interleave unrelated objects), so a per-mode
    // endpoint check is needed. A blanket `insertAt === bottomIdx` wrongly
    // treated any group whose bottom member sat at index 0 as already-at-back.
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
    // markDirty() bumps the revision so PageView re-renders the bitmap, and
    // markNeedsGenerate() regenerates the content stream so the new paint order
    // shows on screen AND survives save. A bare `dirty = true` did neither, so a
    // reorder silently had no visible effect (and was lost on save).
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
    page: import("@app/tools/pdfTextEditor/v2/model/Page").Page,
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
