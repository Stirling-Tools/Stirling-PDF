import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { TextRunSnapshot } from "@app/tools/pdfTextEditor/v2/types";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * Removes a run from the page model. Note: at apply time, the PDFium object
 * is moved to a 'tombstoned' state via FPDFPage_RemoveObject. We do not
 * destroy it so revert can re-insert it.
 *
 * V0 stores a snapshot; PdfiumTextWriter.removeRun handles the WASM side.
 */
export class DeleteObjectCommand implements Command {
  readonly type = "delete-object";
  private readonly pageIndex: number;
  private readonly runId: string;
  private snapshot: TextRunSnapshot | null;
  private cachedObjPtr: number;

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.snapshot = null;
    this.cachedObjPtr = 0;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.snapshot === null) {
      this.snapshot = run.snapshot();
      this.cachedObjPtr = run.pdfiumObjPtr;
    }
    // Remove via PDFium then drop from the local list.
    doc.module.FPDFPage_RemoveObject(page.pagePtr, run.pdfiumObjPtr);
    page.setRuns(page.runs.filter((r) => r.id !== run.id));
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    if (!this.snapshot || !this.cachedObjPtr) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_InsertObject(page.pagePtr, this.cachedObjPtr);
    const restored = new TextRun({
      ...this.snapshot,
      pdfiumObjPtr: this.cachedObjPtr,
    });
    page.setRuns([...page.runs, restored]);
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }
}
