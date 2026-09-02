import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { emitStyledCellText } from "@app/tools/pdfTextEditor/commands/tableHelpers";

// Puts the first text into a previously-empty table cell: inserts a text run at
// the cell's anchor and links it to the cell. Subsequent edits of that cell go
// through the normal EditTextCommand path on the created run.
export class FillTableCellCommand implements Command {
  readonly type = "fill-table-cell";
  private readonly tableId: string;
  private readonly row: number;
  private readonly col: number;
  private readonly text: string;
  private createdRunId: string | null = null;
  private createdObjPtr = 0;

  constructor(opts: {
    tableId: string;
    row: number;
    col: number;
    text: string;
  }) {
    this.tableId = opts.tableId;
    this.row = opts.row;
    this.col = opts.col;
    this.text = opts.text;
  }

  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndexOf(doc));
    const model = page.tables.find((t) => t.id === this.tableId);
    if (!model) return;
    if (model.cellRuns[this.row]?.[this.col]) return; // already filled
    const emitted = emitStyledCellText(
      doc,
      page,
      model,
      this.row,
      this.col,
      this.text,
    );
    if (!emitted) return;
    model.cellRuns[this.row][this.col] = emitted.run.id;
    this.createdRunId = emitted.run.id;
    this.createdObjPtr = emitted.ptr;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.createdRunId) return;
    const page = doc.page(this.pageIndexOf(doc));
    if (this.createdObjPtr) {
      doc.module.FPDFPage_RemoveObject(page.pagePtr, this.createdObjPtr);
    }
    page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    const model = page.tables.find((t) => t.id === this.tableId);
    if (model && model.cellRuns[this.row]?.[this.col] === this.createdRunId) {
      model.cellRuns[this.row][this.col] = null;
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  // The table id carries its page index as its first segment ("p<index>-...").
  private pageIndexOf(doc: EditorDocument): number {
    const match = /^p(\d+)-/.exec(this.tableId);
    if (match) return Number(match[1]);
    // Fallback: search loaded pages for the table.
    for (const page of doc.loadedPages()) {
      if (page.tables.some((t) => t.id === this.tableId)) return page.index;
    }
    return 0;
  }

  describe(): string {
    return `Fill cell (${this.row}, ${this.col})`;
  }
}
