import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { TextRunSnapshot } from "@app/tools/pdfTextEditor/v2/types";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Remove a run from the page model and from PDFium.
 *
 * For LineGrouper-merged runs and paragraphs (where the rep is backed by
 * many per-word / per-line PDFium text objects), EVERY sub-object is
 * detached - not just `run.pdfiumObjPtr`. The previous version removed
 * only the rep ptr and left ghost text (every non-anchor sub-word) on
 * the page even though the model dropped the run.
 *
 * Revert re-inserts every snapshotted ptr via `FPDFPage_InsertObject`.
 * For sub-objects originally inside a form xobject (containerPtr != 0),
 * PDFium has no insert-into-form API, so revert re-inserts them at the
 * page level - the visual position is unchanged but the structural
 * nesting is gone. Acceptable for a delete-then-undo round-trip.
 */
interface CapturedPtr {
  ptr: number;
  containerPtr: number;
}

export class DeleteObjectCommand implements Command {
  readonly type = "delete-object";
  private readonly pageIndex: number;
  private readonly runId: string;
  private snapshot: TextRunSnapshot | null;
  /** Every sub-object pointer + its container at apply time. */
  private cachedPtrs: CapturedPtr[];
  /** The live run instance, re-attached on revert to keep all fields intact. */
  private removedRun: TextRun | null = null;

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.snapshot = null;
    this.cachedPtrs = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.snapshot === null) {
      this.snapshot = run.snapshot();
      this.removedRun = run;
      const memberPtrs = collectMemberPtrs(run);
      const containerByPtr = collectContainersByPtr(run);
      const seen = new Set<number>();
      this.cachedPtrs = [];
      for (const ptr of memberPtrs) {
        if (!ptr || seen.has(ptr)) continue;
        seen.add(ptr);
        this.cachedPtrs.push({
          ptr,
          containerPtr: containerByPtr.get(ptr) ?? run.containerPtr,
        });
      }
    }
    removeMemberPtrs(
      doc.module,
      page,
      this.cachedPtrs.map((c) => c.ptr),
      new Map(this.cachedPtrs.map((c) => [c.ptr, c.containerPtr])),
      run.containerPtr,
    );
    page.setRuns(page.runs.filter((r) => r.id !== run.id));
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.removedRun || this.cachedPtrs.length === 0) return;
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const formMod = m as unknown as {
      FPDFFormObj_InsertObject?: (form: number, obj: number) => boolean;
    };
    // Re-insert every captured sub-object. Sub-objects that originally
    // lived inside a form xobject get re-inserted at the page level when
    // PDFium doesn't expose a form-insert API - structural nesting is
    // lost but the on-page rendering stays right.
    for (const { ptr, containerPtr } of this.cachedPtrs) {
      if (!ptr) continue;
      try {
        if (containerPtr && formMod.FPDFFormObj_InsertObject) {
          formMod.FPDFFormObj_InsertObject(containerPtr, ptr);
        } else {
          m.FPDFPage_InsertObject(page.pagePtr, ptr);
        }
      } catch {
        /* best-effort */
      }
    }
    // Re-attach the live instance so every field (mergedFrom*, paragraph*,
    // coverRectPtr, containerPtr) is restored exactly as before delete.
    if (!page.findRun(this.removedRun.id)) {
      page.setRuns([...page.runs, this.removedRun]);
    }
    page.markDirty();
    page.markNeedsGenerate();
  }
}
