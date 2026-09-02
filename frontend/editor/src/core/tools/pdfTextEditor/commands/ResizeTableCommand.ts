import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import {
  moveColumnEdge,
  moveRowEdge,
  resizeColumnTrack,
  resizeRowTrack,
  scaleColumnEdges,
  scaleRowEdges,
} from "@app/tools/pdfTextEditor/util/tableGeometry";
import {
  absoluteFontScale,
  applyCellPlacement,
  captureCellPlacement,
  type CellPlacement,
  redrawGrid,
  setTableEdges,
  shiftRunBy,
} from "@app/tools/pdfTextEditor/commands/tableHelpers";
import { SetFontSizeCommand } from "@app/tools/pdfTextEditor/commands/SetFontSizeCommand";

// A geometry gesture, in PDF points. "col-edge"/"row-edge" move one internal
// boundary, resizing only the two tracks it separates; "scale" resizes the
// whole grid from its top-left corner, keeping every track's share; "move"
// translates the whole thing, changing no track at all.
export type TableResize =
  | { kind: "col-edge"; index: number; x: number }
  | { kind: "row-edge"; index: number; y: number }
  | { kind: "scale"; width: number; height: number }
  | { kind: "move"; dx: number; dy: number }
  // "col-size"/"row-size" resize the single track before the edge, sliding the
  // rest along, so the table grows or shrinks by what that track gained.
  | { kind: "col-size"; index: number; x: number }
  | { kind: "row-size"; index: number; y: number };

// Geometric edit of a session table. Undo restores the exact edge arrays
// captured at apply, so a resize is one history step no matter how far the
// pointer travelled.
export class ResizeTableCommand implements Command {
  readonly type = "resize-table";
  private readonly tableId: string;
  private readonly edit: TableResize;
  private before: { colEdges: number[]; rowEdges: number[] } | null = null;
  private placement: CellPlacement[] | null = null;
  // Exact pen origin AND box before the scale. Undo restores these rather than
  // re-deriving a position: the font-size revert moves the origin too, so a
  // delta computed after it drifts.
  private prevOrigins: {
    runId: string;
    e: number;
    f: number;
    x: number;
    y: number;
  }[] = [];
  private fontScale = 1;
  /** Content scale before this command, so undo puts the reference back. */
  private prevContentScale = 1;
  private resizes: Command[] = [];

  constructor(opts: { tableId: string; edit: TableResize }) {
    this.tableId = opts.tableId;
    this.edit = opts.edit;
  }

  apply(doc: EditorDocument): void {
    const { page, model } = this.locate(doc);
    if (!page || !model) return;
    this.before = {
      colEdges: [...model.colEdges],
      rowEdges: [...model.rowEdges],
    };
    const { colEdges, rowEdges } = this.nextEdges(model);
    if (this.edit.kind === "scale") {
      // Scaling the frame scales what is in it: text kept at its old size in a
      // shrinking cell just spills over the column beside it.
      this.placement = captureCellPlacement(doc, page, model);
      this.prevOrigins = model.cellRuns
        .flat()
        .filter((id): id is string => id !== null)
        .map((id) => {
          const run = page.findRun(id);
          if (!run) return null;
          return {
            runId: id,
            e: run.matrix.e,
            f: run.matrix.f,
            x: run.bounds.x,
            y: run.bounds.y,
          };
        })
        .filter((p) => p !== null);
      // Derived from the table's size against a FIXED reference, not from this
      // gesture: an incremental min(widthRatio, heightRatio) does not
      // round-trip, so grow/shrink cycles walked the type steadily smaller.
      this.prevContentScale = model.fontBase.scale;
      const target = absoluteFontScale(model, colEdges, rowEdges);
      this.fontScale = target / (model.fontBase.scale || 1);
      model.fontBase.scale = target;
      this.resizes = scaleCellFonts(doc, page, model, this.fontScale);
      model.colEdges = [...colEdges];
      model.rowEdges = [...rowEdges];
      applyCellPlacement(doc, page, model, this.placement, this.fontScale);
      redrawGrid(doc, page, model);
    } else {
      setTableEdges(doc, page, model, colEdges, rowEdges);
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const { page, model } = this.locate(doc);
    if (!page || !model || !this.before) return;
    if (this.edit.kind === "scale") {
      for (let i = this.resizes.length - 1; i >= 0; i--) {
        this.resizes[i].revert(doc);
      }
      this.resizes = [];
      model.fontSize /= this.fontScale;
      for (const style of model.columnStyles) style.fontSize /= this.fontScale;
      if (model.headerStyle) model.headerStyle.fontSize /= this.fontScale;
      model.fontBase.scale = this.prevContentScale;
      model.colEdges = [...this.before.colEdges];
      model.rowEdges = [...this.before.rowEdges];
      // Put every entry back where it was, rather than re-deriving a position:
      // reverting the font size moves the pen origin too, so a delta measured
      // afterwards drifts by the cell's inset.
      for (const spot of this.prevOrigins) {
        const run = page.findRun(spot.runId);
        if (!run) continue;
        shiftRunBy(
          doc.module,
          run,
          spot.e - run.matrix.e,
          spot.f - run.matrix.f,
        );
        run.bounds = { ...run.bounds, x: spot.x, y: spot.y };
      }
      redrawGrid(doc, page, model);
    } else {
      setTableEdges(
        doc,
        page,
        model,
        this.before.colEdges,
        this.before.rowEdges,
      );
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  private nextEdges(model: TableModel): {
    colEdges: number[];
    rowEdges: number[];
  } {
    switch (this.edit.kind) {
      case "col-edge":
        return {
          colEdges: moveColumnEdge(
            model.colEdges,
            this.edit.index,
            this.edit.x,
          ),
          rowEdges: [...model.rowEdges],
        };
      case "row-edge":
        return {
          colEdges: [...model.colEdges],
          rowEdges: moveRowEdge(model.rowEdges, this.edit.index, this.edit.y),
        };
      case "scale":
        return {
          colEdges: scaleColumnEdges(model.colEdges, this.edit.width),
          rowEdges: scaleRowEdges(model.rowEdges, this.edit.height),
        };
      case "col-size":
        return {
          colEdges: resizeColumnTrack(
            model.colEdges,
            this.edit.index,
            this.edit.x,
          ),
          rowEdges: [...model.rowEdges],
        };
      case "row-size":
        return {
          colEdges: [...model.colEdges],
          rowEdges: resizeRowTrack(
            model.rowEdges,
            this.edit.index,
            this.edit.y,
          ),
        };
      case "move": {
        const { dx, dy } = this.edit;
        return {
          colEdges: model.colEdges.map((x) => x + dx),
          rowEdges: model.rowEdges.map((y) => y + dy),
        };
      }
    }
  }

  private locate(doc: EditorDocument): {
    page: Page | null;
    model: TableModel | null;
  } {
    const match = /^p(\d+)-/.exec(this.tableId);
    const pageIndex = match ? Number(match[1]) : null;
    const pages =
      pageIndex !== null ? [doc.page(pageIndex)] : doc.loadedPages();
    for (const page of pages) {
      const model = page.tables.find((t) => t.id === this.tableId);
      if (model) return { page, model };
    }
    return { page: null, model: null };
  }

  describe(): string {
    return `resize-table:${this.edit.kind}`;
  }
}

// Resize every cell's text through the toolbar's own font-size command, so the
// glyph scaling, matrix and letter-spacing bookkeeping stay in one place.
function scaleCellFonts(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
  scale: number,
): Command[] {
  if (Math.abs(scale - 1) < 0.001) return [];
  const applied: Command[] = [];
  for (const row of model.cellRuns) {
    for (const id of row) {
      if (!id) continue;
      const run = page.findRun(id);
      if (!run || run.fontSize <= 0) continue;
      const cmd = new SetFontSizeCommand({
        pageIndex: model.pageIndex,
        runId: id,
        nextSize: run.fontSize * scale,
      });
      cmd.apply(doc);
      applied.push(cmd);
    }
  }
  model.fontSize *= scale;
  for (const style of model.columnStyles) style.fontSize *= scale;
  if (model.headerStyle) model.headerStyle.fontSize *= scale;
  return applied;
}
