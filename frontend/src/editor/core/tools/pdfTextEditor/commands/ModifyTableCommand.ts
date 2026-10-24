import { locateTable } from "@app/tools/pdfTextEditor/util/locateTable";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { TableCellStyle } from "@app/tools/pdfTextEditor/types";
import { DeleteObjectCommand } from "@app/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { defaultCellStyle } from "@app/tools/pdfTextEditor/model/TableModel";
import {
  insertColumnEdges,
  insertRowEdges,
  removeColumnEdges,
  removeRowEdges,
} from "@app/tools/pdfTextEditor/util/tableGeometry";
import {
  bandColorFor,
  paintRowFill,
  redrawGrid,
  removeObjects,
  renormaliseFontBase,
  shiftRunBy,
} from "@app/tools/pdfTextEditor/commands/tableHelpers";
import type { RowFill } from "@app/tools/pdfTextEditor/model/TableModel";

export type TableOp = "add-row" | "delete-row" | "add-col" | "delete-col";

// Structural edit of a session table: add or remove a row or column. Moves the
// runs that live in the affected tracks, redraws the ruling lines, and keeps
// the cell->run map in step. Deletes retain the original objects for undo.
export class ModifyTableCommand implements Command {
  readonly type = "modify-table";
  private readonly tableId: string;
  private readonly op: TableOp;
  private readonly index: number;
  /** Height (row) or width (column) of the affected track, resolved at apply. */
  private size = 0;
  private removed: DeleteObjectCommand[] = [];
  private before: {
    cellRuns: TableModel["cellRuns"];
    cellExtraRuns: TableModel["cellExtraRuns"];
    cellSpans: TableModel["cellSpans"];
    origins: { id: string; e: number; f: number }[];
  } | null = null;
  /** Style of a deleted column, so undo brings the column back as it was. */
  private removedStyle: TableCellStyle | null = null;
  /** Background painted for an added row, so undo can take it away again. */
  private paintedFill: RowFill | null = null;
  /** Background of a deleted row, so undo can put it back. */
  private removedFill: RowFill | null = null;

  constructor(opts: { tableId: string; op: TableOp; index: number }) {
    this.tableId = opts.tableId;
    this.op = opts.op;
    this.index = opts.index;
  }

  apply(doc: EditorDocument): void {
    const found = locateTable(doc, this.tableId);
    if (!found) return;
    const { page, model } = found;
    const isRow = this.op.endsWith("row");
    const count = isRow ? model.rows : model.cols;
    const adding = this.op.startsWith("add");
    if (
      !Number.isInteger(this.index) ||
      this.index < 0 ||
      this.index > count - (adding ? 0 : 1) ||
      (!adding && count <= 1)
    )
      return;
    this.before = {
      cellRuns: model.cellRuns.map((row) => [...row]),
      cellExtraRuns: model.cellExtraRuns.map((row) =>
        row.map((ids) => (ids ? [...ids] : null)),
      ),
      cellSpans: model.cellSpans.map((row) =>
        row.map((span) => (span ? { ...span } : null)),
      ),
      origins: [
        ...new Set(
          model.cellRuns.flatMap((row, r) =>
            row.flatMap((_id, c) => model.runsAt(r, c)),
          ),
        ),
      ].flatMap((id) => {
        const run = page.findRun(id);
        return run ? [{ id, e: run.matrix.e, f: run.matrix.f }] : [];
      }),
    };
    switch (this.op) {
      case "add-row":
        this.addRow(doc, page, model);
        break;
      case "delete-row":
        this.deleteRow(doc, page, model);
        break;
      case "add-col":
        this.addColumn(doc, page, model);
        break;
      case "delete-col":
        this.deleteColumn(doc, page, model);
        break;
    }
    this.adjustSpans(model, isRow, adding);
    // The table changed extent without its type changing, so the font
    // reference moves with it.
    renormaliseFontBase(model);
    redrawGrid(doc, page, model);
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const found = locateTable(doc, this.tableId);
    if (!found || !this.before) return;
    const { page, model } = found;
    switch (this.op) {
      case "add-row":
        if (this.paintedFill) {
          removeObjects(doc.module, page, [this.paintedFill.ptr]);
          model.rowFills = model.rowFills.filter((f) => f !== this.paintedFill);
          this.paintedFill = null;
        }
        this.deleteRowAt(doc, page, model, this.index, this.size, false);
        break;
      case "delete-row":
        this.reinsertRow(doc, page, model);
        break;
      case "add-col":
        this.deleteColumnAt(doc, page, model, this.index, this.size, false);
        break;
      case "delete-col":
        this.reinsertColumn(doc, page, model);
        break;
    }
    model.cellRuns = this.before.cellRuns.map((row) => [...row]);
    model.cellExtraRuns = this.before.cellExtraRuns.map((row) =>
      row.map((ids) => (ids ? [...ids] : null)),
    );
    model.cellSpans = this.before.cellSpans.map((row) =>
      row.map((span) => (span ? { ...span } : null)),
    );
    for (const spot of this.before.origins) {
      const run = page.findRun(spot.id);
      if (run)
        shiftRunBy(
          doc.module,
          run,
          spot.e - run.matrix.e,
          spot.f - run.matrix.f,
        );
    }
    renormaliseFontBase(model);
    redrawGrid(doc, page, model);
    page.markDirty();
    page.markNeedsGenerate();
  }

  private addRow(doc: EditorDocument, page: Page, model: TableModel): void {
    const h = this.avgRowHeight(model);
    this.size = h;
    // Rows at/below the insertion move down by h.
    this.shiftCells(doc, page, model, (r) => r >= this.index, 0, -h);
    model.rowEdges = insertRowEdges(model.rowEdges, this.index, h).edges;
    model.cellRuns.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    model.cellSpans.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    model.cellExtraRuns.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    this.shiftFillRows(model, this.index, 1);
    // A banded table keeps its rhythm: the new row takes the paint the pattern
    // calls for rather than arriving blank.
    const color = bandColorFor(model, this.index);
    if (color) {
      this.paintedFill = paintRowFill(doc, page, model, this.index, color);
      if (this.paintedFill) model.rowFills.push(this.paintedFill);
    }
  }

  private deleteRow(doc: EditorDocument, page: Page, model: TableModel): void {
    const h = model.rowEdges[this.index] - model.rowEdges[this.index + 1];
    this.size = h;
    this.deleteRowAt(doc, page, model, this.index, h, true);
  }

  // Shared by delete-row and revert-of-add-row. `capture` controls whether the
  // removed cell content is recorded for later restoration.
  private deleteRowAt(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
    index: number,
    h: number,
    capture: boolean,
  ): void {
    this.removeTrackRuns(
      doc,
      page,
      model,
      (r, c) => r === index && model.spanAt(r, c).rowSpan === 1,
      capture,
    );
    // Rows below the deleted one move up by h.
    this.shiftCells(doc, page, model, (r) => r > index, 0, h);
    model.rowEdges = removeRowEdges(model.rowEdges, index).edges;
    model.cellRuns.splice(index, 1);
    model.cellSpans.splice(index, 1);
    model.cellExtraRuns.splice(index, 1);
    const dropped = model.rowFills.find((f) => f.row === index) ?? null;
    if (dropped) {
      removeObjects(doc.module, page, [dropped.ptr]);
      model.rowFills = model.rowFills.filter((f) => f !== dropped);
      if (capture) this.removedFill = dropped;
    }
    this.shiftFillRows(model, index + 1, -1);
  }

  private reinsertRow(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
  ): void {
    const h = this.size;
    // Rows currently at/below the slot move back down by h to make room.
    this.shiftCells(doc, page, model, (r) => r >= this.index, 0, -h);
    model.rowEdges = insertRowEdges(model.rowEdges, this.index, h).edges;
    model.cellRuns.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    model.cellSpans.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    model.cellExtraRuns.splice(
      this.index,
      0,
      Array.from({ length: model.cols }, () => null),
    );
    this.shiftFillRows(model, this.index, 1);
    if (this.removedFill) {
      const back = paintRowFill(
        doc,
        page,
        model,
        this.index,
        this.removedFill.color,
      );
      if (back) model.rowFills.push(back);
      this.removedFill = null;
    }
    this.restoreCaptured(doc);
  }

  // Fills are bound by row index, so an insert or delete above them has to move
  // them or every band below lands on the wrong row.
  private shiftFillRows(model: TableModel, from: number, by: number): void {
    for (const fill of model.rowFills) {
      if (fill.row >= from) fill.row += by;
    }
  }

  private addColumn(doc: EditorDocument, page: Page, model: TableModel): void {
    const w = this.avgColWidth(model);
    this.size = w;
    this.shiftCells(doc, page, model, (_r, c) => c >= this.index, w, 0);
    model.colEdges = insertColumnEdges(model.colEdges, this.index, w).edges;
    for (const row of model.cellRuns) row.splice(this.index, 0, null);
    for (const row of model.cellSpans) row.splice(this.index, 0, null);
    for (const row of model.cellExtraRuns) row.splice(this.index, 0, null);
    // A new column writes like the one it was added beside.
    model.columnStyles.splice(this.index, 0, this.neighbourStyle(model));
  }

  private deleteColumn(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
  ): void {
    const w = model.colEdges[this.index + 1] - model.colEdges[this.index];
    this.size = w;
    this.deleteColumnAt(doc, page, model, this.index, w, true);
  }

  private deleteColumnAt(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
    index: number,
    w: number,
    capture: boolean,
  ): void {
    this.removeTrackRuns(
      doc,
      page,
      model,
      (r, c) => c === index && model.spanAt(r, c).colSpan === 1,
      capture,
    );
    this.shiftCells(doc, page, model, (_r, c) => c > index, -w, 0);
    model.colEdges = removeColumnEdges(model.colEdges, index).edges;
    for (const row of model.cellRuns) row.splice(index, 1);
    for (const row of model.cellSpans) row.splice(index, 1);
    for (const row of model.cellExtraRuns) row.splice(index, 1);
    const [dropped] = model.columnStyles.splice(index, 1);
    if (capture) this.removedStyle = dropped ?? null;
  }

  private reinsertColumn(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
  ): void {
    const w = this.size;
    this.shiftCells(doc, page, model, (_r, c) => c >= this.index, w, 0);
    model.colEdges = insertColumnEdges(model.colEdges, this.index, w).edges;
    for (const row of model.cellRuns) row.splice(this.index, 0, null);
    for (const row of model.cellSpans) row.splice(this.index, 0, null);
    for (const row of model.cellExtraRuns) row.splice(this.index, 0, null);
    model.columnStyles.splice(
      this.index,
      0,
      this.removedStyle ?? this.neighbourStyle(model),
    );
    this.restoreCaptured(doc);
  }

  private neighbourStyle(model: TableModel): TableCellStyle {
    const src =
      model.columnStyles[this.index - 1] ?? model.columnStyles[this.index];
    return src
      ? { ...src, fill: { ...src.fill } }
      : defaultCellStyle(model.fontSize);
  }

  private avgRowHeight(model: TableModel): number {
    const total = model.rowEdges[0] - model.rowEdges[model.rowEdges.length - 1];
    return total / model.rows;
  }

  private avgColWidth(model: TableModel): number {
    const total = model.colEdges[model.colEdges.length - 1] - model.colEdges[0];
    return total / model.cols;
  }

  // Move every run whose cell matches `pred` by (dx, dy). Iterates a static
  // copy of the current cell map so splices elsewhere don't interfere.
  private shiftCells(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
    pred: (r: number, c: number) => boolean,
    dx: number,
    dy: number,
  ): void {
    if (dx === 0 && dy === 0) return;
    for (let r = 0; r < model.cellRuns.length; r++) {
      for (let c = 0; c < model.cellRuns[r].length; c++) {
        if (!pred(r, c)) continue;
        for (const id of model.runsAt(r, c)) {
          const run = page.findRun(id);
          if (run) shiftRunBy(doc.module, run, dx, dy);
        }
      }
    }
  }

  private removeTrackRuns(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
    pred: (r: number, c: number) => boolean,
    capture: boolean,
  ): void {
    const toRemove = new Set<string>();
    for (let r = 0; r < model.cellRuns.length; r++) {
      for (let c = 0; c < model.cellRuns[r].length; c++) {
        if (pred(r, c)) for (const id of model.runsAt(r, c)) toRemove.add(id);
      }
    }
    if (toRemove.size === 0) return;
    if (capture) this.removed = [];
    for (const runId of toRemove) {
      const cmd = new DeleteObjectCommand({ pageIndex: page.index, runId });
      cmd.apply(doc);
      if (capture) this.removed.push(cmd);
    }
  }

  private restoreCaptured(doc: EditorDocument): void {
    for (const cmd of this.removed) cmd.revert(doc);
    this.removed = [];
  }

  private adjustSpans(
    model: TableModel,
    isRow: boolean,
    adding: boolean,
  ): void {
    if (!this.before) return;
    for (let r = 0; r < this.before.cellSpans.length; r++) {
      for (let c = 0; c < this.before.cellSpans[r].length; c++) {
        const original = this.before.cellSpans[r][c];
        if (!original) continue;
        const start = isRow ? r : c;
        const length = isRow ? original.rowSpan : original.colSpan;
        if (!adding && start === this.index && length === 1) continue;
        const next = adding
          ? start + (start >= this.index ? 1 : 0)
          : start - (start > this.index ? 1 : 0);
        const row = isRow ? next : r;
        const col = isRow ? c : next;
        const span = { ...original };
        if (
          adding
            ? start < this.index && this.index < start + length
            : start <= this.index && this.index < start + length
        ) {
          if (isRow) span.rowSpan += adding ? 1 : -1;
          else span.colSpan += adding ? 1 : -1;
        }
        model.cellSpans[row][col] =
          span.rowSpan > 1 || span.colSpan > 1 ? span : null;
        if (!adding && start === this.index) {
          model.cellRuns[row][col] = this.before.cellRuns[r][c];
          model.cellExtraRuns[row][col] = this.before.cellExtraRuns[r][c];
        }
      }
    }
  }

  describe(): string {
    return this.op;
  }
}
