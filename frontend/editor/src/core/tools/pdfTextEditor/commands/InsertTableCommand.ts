import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import {
  uniformColumnEdges,
  uniformRowEdges,
} from "@app/tools/pdfTextEditor/util/tableGeometry";
import {
  redrawGrid,
  removeObjects,
} from "@app/tools/pdfTextEditor/commands/tableHelpers";

const DEFAULT_LINE_WIDTH = 0.75;
const DEFAULT_FONT_SIZE = 11;

// Draws a bordered grid of ruling lines on the page and registers a session
// table for it. Cells start empty; content is added lazily when the user types.
export class InsertTableCommand implements Command {
  readonly type = "insert-table";
  private readonly pageIndex: number;
  private readonly x: number;
  private readonly topY: number;
  private readonly width: number;
  private readonly height: number;
  private readonly rows: number;
  private readonly cols: number;
  private readonly lineWidth: number;
  private readonly fontSize: number;
  private tableId: string | null = null;

  constructor(opts: {
    pageIndex: number;
    /** Left edge in PDF points. */
    x: number;
    /** Top edge in PDF points (y-up). */
    y: number;
    width: number;
    height: number;
    rows: number;
    cols: number;
    lineWidth?: number;
    fontSize?: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.x = opts.x;
    this.topY = opts.y;
    this.width = opts.width;
    this.height = opts.height;
    this.rows = Math.max(1, Math.round(opts.rows));
    this.cols = Math.max(1, Math.round(opts.cols));
    this.lineWidth = opts.lineWidth ?? DEFAULT_LINE_WIDTH;
    this.fontSize = opts.fontSize ?? DEFAULT_FONT_SIZE;
  }

  /** Id of the table this command created, after apply. */
  get insertedTableId(): string | null {
    return this.tableId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const colEdges = uniformColumnEdges(this.x, this.width, this.cols);
    const rowEdges = uniformRowEdges(this.topY, this.height, this.rows);
    const cellRuns: (string | null)[][] = Array.from(
      { length: this.rows },
      () => Array.from({ length: this.cols }, () => null),
    );
    const id =
      this.tableId ?? `p${page.index}-tbl-${page.tables.length}-${Date.now()}`;
    const model = new TableModel({
      id,
      pageIndex: page.index,
      colEdges,
      rowEdges,
      cellRuns,
      hLinePtrs: [],
      vLinePtrs: [],
      lineWidth: this.lineWidth,
      fontSize: this.fontSize,
    });
    redrawGrid(doc, page, model);
    page.tables = [...page.tables, model];
    this.tableId = id;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.tableId) return;
    const page = doc.page(this.pageIndex);
    const model = page.tables.find((t) => t.id === this.tableId);
    if (!model) return;
    const m = doc.module;
    removeObjects(m, page, [...model.hLinePtrs, ...model.vLinePtrs]);
    // Any surviving cell runs (defensive: cell edits are separate history
    // entries and are normally reverted before this one).
    const cellRunIds = new Set(
      model.cellRuns.flat().filter((r): r is string => r !== null),
    );
    if (cellRunIds.size > 0) {
      for (const run of page.runs) {
        if (cellRunIds.has(run.id) && run.pdfiumObjPtr) {
          m.FPDFPage_RemoveObject(page.pagePtr, run.pdfiumObjPtr);
        }
      }
      page.setRuns(page.runs.filter((r) => !cellRunIds.has(r.id)));
    }
    page.tables = page.tables.filter((t) => t.id !== this.tableId);
    page.markDirty();
    page.markNeedsGenerate();
  }

  describe(): string {
    return `Insert ${this.rows}x${this.cols} table`;
  }
}
