import type {
  PageRect,
  RGBA,
  TableCellSnapshot,
  TableCellStyle,
  TableSnapshot,
} from "@app/tools/pdfTextEditor/types";
import { BLACK } from "@app/tools/pdfTextEditor/model/Color";

/** How many grid tracks a cell covers. Absent means the ordinary 1x1. */
export interface CellSpan {
  rowSpan: number;
  colSpan: number;
}

/** A background the page paints behind one row of the table. */
export interface RowFill {
  row: number;
  ptr: number;
  /** Where it sits right now, so the next fit is a delta from here. */
  rect: PageRect;
  /** The paint, so a row added later can continue the pattern. */
  color: RGBA;
}

/** What a cell looks like when the table has nothing to copy from. */
export function defaultCellStyle(fontSize: number): TableCellStyle {
  return {
    family: "Helvetica",
    fontSize,
    fill: { ...BLACK },
    align: "left",
    sourceFontId: "base14:Helvetica",
  };
}

// Session model for a table the editor DREW (as opposed to one recognized from
// arbitrary text). It tracks the grid geometry, the ruling-line PDFium object
// pointers, and which run backs each cell, so structural edits (add/remove
// row/column) can move the right objects and stay undoable. The PDF itself
// still persists only the lines + text runs; this model is not serialized.
export class TableModel {
  readonly id: string;
  readonly pageIndex: number;
  colEdges: number[];
  rowEdges: number[];
  /** Run id backing each cell, indexed [row][col]; null when the cell is empty. */
  cellRuns: (string | null)[][];
  // Further runs sharing a cell. OCR in particular splits one entry into
  // several text objects ("Q1 Sales" arrives as two), and a cell that tracks
  // only the first leaves the rest behind whenever the table moves.
  cellExtraRuns: (string[] | null)[][];
  // Merge structure, indexed [row][col] alongside cellRuns. An entry marks an
  // ANCHOR and how far it reaches; the positions it covers stay null in both
  // arrays, so every `if (!id) continue` loop keeps working untouched.
  cellSpans: (CellSpan | null)[][];
  /** Horizontal ruling-line object pointers, top-to-bottom. */
  hLinePtrs: number[];
  /** Vertical ruling-line object pointers, left-to-right. */
  vLinePtrs: number[];
  lineWidth: number;
  /** Colour the ruling lines are drawn in, copied from the table's own. */
  lineColor: RGBA;
  // Background boxes the page paints behind whole rows (header shading), with
  // the rect each currently occupies so it can be refitted when the grid moves.
  rowFills: RowFill[];
  // The size the text was set for, and how much it has been scaled since. Text
  // scaling is derived from the table's size against THIS reference, never from
  // the last gesture: min(widthRatio, heightRatio) applied per drag does not
  // round-trip, so growing and shrinking repeatedly walked the type smaller.
  fontBase: { width: number; height: number; scale: number };
  fontSize: number;
  // False for a table adopted from recognized text: its rules (if any) are the
  // document's own objects, so structural edits must not draw or move any.
  ruled: boolean;
  /** True when the page draws this grid itself (an adopted ruled table). */
  pageRuled: boolean;
  // True when this grid wraps text the document already had, rather than one
  // the editor inserted - it can be handed back without deleting anything.
  adopted: boolean;
  // A picture with invisible OCR text over it: a structural edit has to rebuild
  // it as real objects before anything can move on screen.
  scanned: boolean;
  // Text style per column, so a cell filled later matches the ones already in
  // that column rather than reverting to the editor's defaults.
  columnStyles: TableCellStyle[];
  /** Header-row style, when row 0 is set differently from the body. */
  headerStyle: TableCellStyle | null;

  constructor(init: {
    id: string;
    pageIndex: number;
    colEdges: number[];
    rowEdges: number[];
    cellRuns: (string | null)[][];
    cellSpans?: (CellSpan | null)[][];
    cellExtraRuns?: (string[] | null)[][];
    hLinePtrs: number[];
    vLinePtrs: number[];
    lineWidth: number;
    lineColor?: RGBA;
    rowFills?: RowFill[];
    fontSize: number;
    ruled?: boolean;
    pageRuled?: boolean;
    adopted?: boolean;
    scanned?: boolean;
    columnStyles?: TableCellStyle[];
    headerStyle?: TableCellStyle | null;
  }) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.colEdges = init.colEdges;
    this.rowEdges = init.rowEdges;
    this.cellRuns = init.cellRuns;
    this.cellSpans =
      init.cellSpans ?? init.cellRuns.map((row) => row.map(() => null));
    this.cellExtraRuns =
      init.cellExtraRuns ?? init.cellRuns.map((row) => row.map(() => null));
    this.hLinePtrs = init.hLinePtrs;
    this.vLinePtrs = init.vLinePtrs;
    this.lineWidth = init.lineWidth;
    this.lineColor = init.lineColor ?? { ...BLACK };
    this.rowFills = init.rowFills ?? [];
    this.fontBase = {
      width: Math.max(
        1,
        init.colEdges[init.colEdges.length - 1] - init.colEdges[0],
      ),
      height: Math.max(
        1,
        init.rowEdges[0] - init.rowEdges[init.rowEdges.length - 1],
      ),
      scale: 1,
    };
    this.fontSize = init.fontSize;
    this.ruled = init.ruled ?? true;
    this.pageRuled = init.pageRuled ?? false;
    this.adopted = init.adopted ?? false;
    this.scanned = init.scanned ?? false;
    const cols = init.colEdges.length - 1;
    this.columnStyles = Array.from(
      { length: Math.max(0, cols) },
      (_, c) => init.columnStyles?.[c] ?? defaultCellStyle(init.fontSize),
    );
    this.headerStyle = init.headerStyle ?? null;
  }

  // The style a cell should be written in. Alignment always comes from the
  // column - it is a property of the column, not of the header font - so the
  // header contributes only its face, size and colour.
  styleFor(row: number, col: number): TableCellStyle {
    const column = this.columnStyles[col] ?? defaultCellStyle(this.fontSize);
    if (row === 0 && this.headerStyle) {
      return { ...this.headerStyle, align: column.align };
    }
    return column;
  }

  get rows(): number {
    return this.rowEdges.length - 1;
  }

  get cols(): number {
    return this.colEdges.length - 1;
  }

  /** Every run in this cell: the one that backs edits, then any others. */
  runsAt(row: number, col: number): string[] {
    const primary = this.cellRuns[row]?.[col];
    if (!primary) return [];
    return [primary, ...(this.cellExtraRuns[row]?.[col] ?? [])];
  }

  /** How far the cell at (row, col) reaches; 1x1 unless the page merged it. */
  spanAt(row: number, col: number): CellSpan {
    return this.cellSpans[row]?.[col] ?? { rowSpan: 1, colSpan: 1 };
  }

  // True when this position is swallowed by a merge anchored to its left or
  // above. Such a position holds no run and gets no cell of its own.
  isCovered(row: number, col: number): boolean {
    for (let r = 0; r <= row; r++) {
      for (let c = 0; c <= col; c++) {
        if (r === row && c === col) continue;
        const span = this.cellSpans[r]?.[c];
        if (!span) continue;
        if (row < r + span.rowSpan && col < c + span.colSpan) return true;
      }
    }
    return false;
  }

  /** Rectangle of one cell in PDF page coords (y-up), spans included. */
  cellRect(row: number, col: number): PageRect {
    const { rowSpan, colSpan } = this.spanAt(row, col);
    const x = this.colEdges[col];
    const right = this.colEdges[Math.min(col + colSpan, this.cols)];
    const top = this.rowEdges[row];
    const bottom = this.rowEdges[Math.min(row + rowSpan, this.rows)];
    return { x, y: bottom, width: right - x, height: top - bottom };
  }

  snapshot(): TableSnapshot {
    const cells: TableCellSnapshot[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // A covered position is not a cell: emitting one would put a second
        // editable box on top of the merged cell that owns the space.
        if (this.isCovered(r, c)) continue;
        const runId = this.cellRuns[r]?.[c] ?? null;
        const { rowSpan, colSpan } = this.spanAt(r, c);
        cells.push({
          row: r,
          col: c,
          runIds: runId ? [runId] : [],
          colSpan,
          rowSpan,
          rect: this.cellRect(r, c),
        });
      }
    }
    const x = this.colEdges[0];
    const right = this.colEdges[this.colEdges.length - 1];
    const top = this.rowEdges[0];
    const bottom = this.rowEdges[this.rowEdges.length - 1];
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      rows: this.rows,
      cols: this.cols,
      colEdges: [...this.colEdges],
      rowEdges: [...this.rowEdges],
      bounds: { x, y: bottom, width: right - x, height: top - bottom },
      cells,
      confidence: 1,
      synthetic: true,
      ruled: this.ruled,
      pageRuled: this.pageRuled,
      adopted: this.adopted,
      scanned: this.scanned,
      columnStyles: this.columnStyles.map((st) => ({
        ...st,
        fill: { ...st.fill },
      })),
      headerStyle: this.headerStyle
        ? { ...this.headerStyle, fill: { ...this.headerStyle.fill } }
        : null,
    };
  }
}
