import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import { measureObjSpanPt } from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import {
  type CellSpan,
  defaultCellStyle,
  type RowFill,
  TableModel,
} from "@app/tools/pdfTextEditor/model/TableModel";
import type {
  PageRect,
  RGBA,
  TableCellStyle,
  TableSnapshot,
} from "@app/tools/pdfTextEditor/types";
import {
  headerDiffers,
  type StyledCell,
  styleOfCells,
} from "@app/tools/pdfTextEditor/util/tableStyle";

const FALLBACK_FONT_SIZE = 11;
/** PDF text render mode 3 = invisible, which is what an OCR layer writes. */
const RENDER_INVISIBLE = 3;
const LINE_WIDTH = 0.75;

/** Id the editable twin of a recognized table takes. */
export function adoptedTableId(table: TableSnapshot): string {
  return `${table.id}-editable`;
}

// Builds the session model that makes a recognized table editable. The runs are
// the document's own text and any ruling lines are its own drawing, so the model
// is unruled: structural edits move text and never paint borders the page did
// not already have.
export function adoptedTableModel(
  module: WrappedPdfiumModule,
  page: Page,
  table: TableSnapshot,
): TableModel {
  // A recognized cell can hold more than one run; the first backs the cell and
  // the rest stay ordinary page text that structural edits will not move.
  const cellRuns: (string | null)[][] = Array.from({ length: table.rows }, () =>
    Array.from({ length: table.cols }, () => null),
  );
  const cellSpans: (CellSpan | null)[][] = Array.from(
    { length: table.rows },
    () => Array.from({ length: table.cols }, () => null),
  );
  const cellExtraRuns: (string[] | null)[][] = Array.from(
    { length: table.rows },
    () => Array.from({ length: table.cols }, () => null),
  );
  for (const cell of table.cells) {
    const row = cellRuns[cell.row];
    if (row) row[cell.col] = cell.runIds[0] ?? null;
    if (cell.runIds.length > 1) {
      const extras = cellExtraRuns[cell.row];
      if (extras) extras[cell.col] = cell.runIds.slice(1);
    }
    if (cell.colSpan > 1 || cell.rowSpan > 1) {
      const spanRow = cellSpans[cell.row];
      if (spanRow) {
        spanRow[cell.col] = { rowSpan: cell.rowSpan, colSpan: cell.colSpan };
      }
    }
  }
  const fontSize = cellFontSize(page, cellRuns);
  const grid = adoptGrid(page, table);
  const { columnStyles, headerStyle } = readStyles(
    module,
    page,
    table,
    cellRuns,
    fontSize,
  );
  return new TableModel({
    id: table.id.endsWith("-editable") ? table.id : adoptedTableId(table),
    pageIndex: table.pageIndex,
    colEdges: [...table.colEdges],
    rowEdges: [...table.rowEdges],
    cellRuns,
    cellSpans,
    cellExtraRuns,
    hLinePtrs: grid.ptrs,
    vLinePtrs: [],
    lineWidth: grid.lineWidth,
    lineColor: grid.lineColor,
    rowFills: adoptRowFills(page, table),
    fontSize,
    // Taking over the page's own lines is what lets a new row or a resize
    // carry the grid with it; without it the text moves and the printed rules
    // stay behind.
    ruled: grid.ptrs.length > 0,
    pageRuled: table.pageRuled,
    adopted: true,
    scanned: looksScanned(module, page, table, cellRuns),
    columnStyles,
    headerStyle,
  });
}

// A scan carries the table as a picture with an INVISIBLE OCR text layer over
// it. Editing moves that text, so nothing appears to happen until the table is
// rebuilt as real objects. Both halves are required: invisible text alone is
// just hidden text, and an image alone is a table printed over a photo.
function looksScanned(
  module: WrappedPdfiumModule,
  page: Page,
  table: TableSnapshot,
  cellRuns: (string | null)[][],
): boolean {
  const overImage = page.images.some((img) =>
    overlaps(img.bounds, table.bounds),
  );
  if (!overImage) return false;
  let seen = 0;
  let invisible = 0;
  for (const row of cellRuns) {
    for (const id of row) {
      if (!id) continue;
      const run = page.findRun(id);
      if (!run?.pdfiumObjPtr) continue;
      seen++;
      if (
        module.FPDFTextObj_GetTextRenderMode(run.pdfiumObjPtr) ===
        RENDER_INVISIBLE
      ) {
        invisible++;
      }
    }
  }
  return seen > 0 && invisible === seen;
}

// The lines the page draws for THIS table, and the ink they are drawn in. The
// editor takes ownership of those objects so redrawGrid can maintain them; the
// rules were already proven to separate this table's tracks, so nothing else on
// the page is caught up in it.
function adoptGrid(
  page: Page,
  table: TableSnapshot,
): { ptrs: number[]; lineWidth: number; lineColor: RGBA } {
  const fallback = {
    ptrs: [] as number[],
    lineWidth: LINE_WIDTH,
    lineColor: { r: 0, g: 0, b: 0, a: 255 } as RGBA,
  };
  if (!table.pageRuled) return fallback;
  const pad = 2;
  const inside = page.rules.filter(
    (r) =>
      r.x >= table.bounds.x - pad &&
      r.x + r.width <= table.bounds.x + table.bounds.width + pad &&
      r.y >= table.bounds.y - pad &&
      r.y + r.height <= table.bounds.y + table.bounds.height + pad,
  );
  if (inside.length === 0) return fallback;
  const ptrs = [...new Set(inside.map((r) => r.ptr))].filter((p) => p > 0);
  if (ptrs.length === 0) return fallback;
  const widths = inside
    .map((r) => r.thickness)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  const counts = new Map<string, { n: number; color: RGBA }>();
  for (const r of inside) {
    const key = `${r.color.r},${r.color.g},${r.color.b},${r.color.a}`;
    const hit = counts.get(key);
    if (hit) hit.n++;
    else counts.set(key, { n: 1, color: r.color });
  }
  let best = fallback.lineColor;
  let bestN = 0;
  for (const entry of counts.values()) {
    if (entry.n > bestN) {
      bestN = entry.n;
      best = entry.color;
    }
  }
  return {
    ptrs,
    lineWidth:
      widths.length > 0 ? widths[Math.floor(widths.length / 2)] : LINE_WIDTH,
    lineColor: best,
  };
}

// Backgrounds the page paints behind a whole row of this table. Bound to the
// row they cover so a later widening or resize carries them along - otherwise
// a new column lands outside the header's shading and reads as unstyled.
function adoptRowFills(page: Page, table: TableSnapshot): RowFill[] {
  const out: RowFill[] = [];
  const width = table.bounds.width;
  if (width <= 0) return out;
  for (const fill of page.fills) {
    // It has to span most of the table to be the ROW's background rather than
    // one cell's highlight, which the editor has no model for yet.
    const covered =
      Math.min(fill.x + fill.width, table.bounds.x + width) -
      Math.max(fill.x, table.bounds.x);
    if (covered / width < 0.9) continue;
    const mid = fill.y + fill.height / 2;
    for (let r = 0; r < table.rows; r++) {
      const top = table.rowEdges[r];
      const bottom = table.rowEdges[r + 1];
      if (mid > bottom && mid < top && fill.height <= (top - bottom) * 1.5) {
        out.push({
          row: r,
          ptr: fill.ptr,
          rect: {
            x: fill.x,
            y: fill.y,
            width: fill.width,
            height: fill.height,
          },
          color: { ...fill.color },
        });
        break;
      }
    }
  }
  return out;
}

// Read each column's style off the text already in it, taking the body rows
// only: a bold header would otherwise make every new cell in the column bold.
// The header keeps its own style when it differs.
function readStyles(
  module: WrappedPdfiumModule,
  page: Page,
  table: TableSnapshot,
  cellRuns: (string | null)[][],
  fontSize: number,
): { columnStyles: TableCellStyle[]; headerStyle: TableCellStyle | null } {
  const rectOf = (row: number, col: number): PageRect => ({
    x: table.colEdges[col],
    y: table.rowEdges[row + 1],
    width: table.colEdges[col + 1] - table.colEdges[col],
    height: table.rowEdges[row] - table.rowEdges[row + 1],
  });
  const collect = (rows: number[], col: number): StyledCell[] => {
    const out: StyledCell[] = [];
    for (const r of rows) {
      const id = cellRuns[r]?.[col];
      if (!id) continue;
      const run = page.findRun(id);
      if (!run) continue;
      const span = run.pdfiumObjPtr
        ? measureObjSpanPt(module, [run.pdfiumObjPtr])
        : null;
      out.push({
        run,
        rect: rectOf(r, col),
        left: span ? span.left : run.bounds.x,
        right: span ? span.right : run.bounds.x + run.bounds.width,
      });
    }
    return out;
  };
  const bodyRows = Array.from({ length: table.rows }, (_, r) => r).slice(
    table.rows > 1 ? 1 : 0,
  );
  const columnStyles = Array.from({ length: table.cols }, (_, c) => {
    // A column with no body text still borrows its header's alignment.
    return (
      styleOfCells(collect(bodyRows, c)) ??
      styleOfCells(collect([0], c)) ??
      defaultCellStyle(fontSize)
    );
  });
  const header =
    table.rows > 1
      ? styleOfCells(
          Array.from({ length: table.cols }, (_, c) => collect([0], c)).flat(),
        )
      : null;
  const body = styleOfCells(
    Array.from({ length: table.cols }, (_, c) => collect(bodyRows, c)).flat(),
  );
  return {
    columnStyles,
    headerStyle: headerDiffers(header, body) ? header : null,
  };
}

// New cell text should match what the table already uses, so take the size from
// its existing runs rather than the editor default.
function cellFontSize(page: Page, cellRuns: (string | null)[][]): number {
  const sizes: number[] = [];
  for (const row of cellRuns) {
    for (const id of row) {
      if (!id) continue;
      const run = page.findRun(id);
      if (run && run.fontSize > 0) sizes.push(run.fontSize);
    }
  }
  if (sizes.length === 0) return FALLBACK_FONT_SIZE;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/** Rectangle overlap test, used to re-find a table after its runs changed. */
export function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
