import { locateTable } from "@app/tools/pdfTextEditor/util/locateTable";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
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
  private createdRun: TextRun | null = null;

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
    const found = locateTable(doc, this.tableId);
    if (!found) return;
    const { page, model } = found;
    if (
      !Number.isInteger(this.row) ||
      !Number.isInteger(this.col) ||
      this.row < 0 ||
      this.col < 0 ||
      this.row >= model.rows ||
      this.col >= model.cols ||
      model.isCovered(this.row, this.col) ||
      model.cellRuns[this.row]?.[this.col]
    )
      return;
    if (this.createdRun) {
      doc.module.FPDFPage_InsertObject(page.pagePtr, this.createdObjPtr);
      page.setRuns([...page.runs, this.createdRun]);
      model.cellRuns[this.row][this.col] = this.createdRun.id;
      page.markDirty();
      page.markNeedsGenerate();
      return;
    }
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
    this.createdRun = emitted.run;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.createdRunId) return;
    const found = locateTable(doc, this.tableId);
    if (!found) return;
    const { page } = found;
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

  describe(): string {
    return `Fill cell (${this.row}, ${this.col})`;
  }
}
