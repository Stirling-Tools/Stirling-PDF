import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { BLACK } from "@app/tools/pdfTextEditor/model/Color";
import type { RGBA } from "@app/tools/pdfTextEditor/types";
import type { RowFill } from "@app/tools/pdfTextEditor/model/TableModel";
import { writeUtf16 } from "@app/services/pdfiumService";
import {
  measureObjBoxPt,
  measureObjSpanPt,
  sanitizeForBase14,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";

const LINE_RGB = { r: 0, g: 0, b: 0 } as const;
const CELL_FAMILY = "Helvetica";
/** Inset of cell text from the cell's left/bottom edges, in points. */
const CELL_PAD = 3;
/** Within this, an entry reads as centred rather than set against an edge. */
const ANCHOR_TOLERANCE_PT = 1.5;

// A ruling line is a thin filled rectangle: robust across PDFium builds and
// needs no stroke-path support. Returns the object pointer.
function emitLineRect(
  m: WrappedPdfiumModule,
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
  color: RGBA = { ...LINE_RGB, a: 255 },
): number {
  const ptr = m.FPDFPageObj_CreateNewRect(
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  if (!ptr) return 0;
  m.FPDFPageObj_SetFillColor(ptr, color.r, color.g, color.b, color.a);
  // Draw mode 2 = fill.
  m.FPDFPath_SetDrawMode(ptr, 2, false);
  m.FPDFPage_InsertObject(page.pagePtr, ptr);
  return ptr;
}

// Stretch each adopted row background onto the row it belongs to. The object is
// TRANSFORMED rather than redrawn: that keeps its exact paint and, crucially,
// its place in the z-order, so it stays behind the text instead of covering it.
export function refitRowFills(doc: EditorDocument, model: TableModel): void {
  if (model.rowFills.length === 0) return;
  const m = doc.module;
  const left = model.colEdges[0];
  const right = model.colEdges[model.colEdges.length - 1];
  for (const fill of model.rowFills) {
    if (fill.row >= model.rows) continue;
    const target = {
      x: left,
      y: model.rowEdges[fill.row + 1],
      width: right - left,
      height: model.rowEdges[fill.row] - model.rowEdges[fill.row + 1],
    };
    const from = fill.rect;
    if (from.width <= 0 || from.height <= 0) continue;
    if (
      Math.abs(from.x - target.x) < 0.01 &&
      Math.abs(from.y - target.y) < 0.01 &&
      Math.abs(from.width - target.width) < 0.01 &&
      Math.abs(from.height - target.height) < 0.01
    ) {
      continue;
    }
    const sx = target.width / from.width;
    const sy = target.height / from.height;
    m.FPDFPageObj_Transform(
      fill.ptr,
      sx,
      0,
      0,
      sy,
      target.x - from.x * sx,
      target.y - from.y * sy,
    );
    fill.rect = target;
  }
}

interface ZOrderModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean | number;
}

// Paint a row's background and put it at the BOTTOM of the page's object list.
// Appending would place it last, which in PDF means on top - covering the very
// text it is meant to sit behind.
export function paintRowFill(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
  row: number,
  color: RGBA,
): RowFill | null {
  const m = doc.module;
  const rect = {
    x: model.colEdges[0],
    y: model.rowEdges[row + 1],
    width: model.colEdges[model.cols] - model.colEdges[0],
    height: model.rowEdges[row] - model.rowEdges[row + 1],
  };
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ptr = m.FPDFPageObj_CreateNewRect(
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  if (!ptr) return null;
  m.FPDFPageObj_SetFillColor(ptr, color.r, color.g, color.b, color.a);
  m.FPDFPath_SetDrawMode(ptr, 2, false);
  const ext = m as unknown as ZOrderModule;
  if (ext.FPDFPage_InsertObjectAtIndex) {
    ext.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, 0);
  } else {
    // Without index insertion the fill would cover the text, so draw nothing.
    return null;
  }
  return { row, ptr, rect, color: { ...color } };
}

// The paint a row added at `row` should take, continuing whatever pattern the
// table already has. Banding alternates, so the row two back is the match.
export function bandColorFor(model: TableModel, row: number): RGBA | null {
  if (model.rowFills.length === 0) return null;
  const byRow = new Map(model.rowFills.map((f) => [f.row, f.color]));
  for (let back = 2; back <= row; back += 2) {
    const hit = byRow.get(row - back);
    if (hit) return { ...hit };
  }
  // Not enough rows to see a pattern: match the nearest painted row instead.
  let best: RowFill | null = null;
  for (const fill of model.rowFills) {
    if (!best || Math.abs(fill.row - row) < Math.abs(best.row - row)) {
      best = fill;
    }
  }
  return best ? { ...best.color } : null;
}

/** Remove a set of page objects, ignoring zero/blank pointers. */
export function removeObjects(
  m: WrappedPdfiumModule,
  page: Page,
  ptrs: number[],
): void {
  for (const ptr of ptrs) {
    if (ptr) m.FPDFPage_RemoveObject(page.pagePtr, ptr);
  }
}

// Remove the model's current ruling lines and draw a fresh grid for its current
// geometry, updating the stored pointers. Used by every structural edit so line
// bookkeeping stays trivial.
export function redrawGrid(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
): void {
  // Backgrounds move with the grid whether or not we own the lines.
  refitRowFills(doc, model);
  if (!model.ruled) return;
  const m = doc.module;
  removeObjects(m, page, [...model.hLinePtrs, ...model.vLinePtrs]);
  const t = model.lineWidth;
  // A merged cell is a boundary the page does NOT draw across those tracks, so
  // each edge is emitted as the segments that survive the merges. Repainting a
  // plain rectangle here would erase every merge on the first structural edit.
  const hLinePtrs: number[] = [];
  for (let r = 0; r < model.rowEdges.length; r++) {
    for (const seg of edgeSegments(model, "h", r)) {
      const ptr = emitLineRect(
        m,
        page,
        {
          x: model.colEdges[seg.from],
          y: model.rowEdges[r] - t / 2,
          width: model.colEdges[seg.to] - model.colEdges[seg.from],
          height: t,
        },
        model.lineColor,
      );
      if (ptr) hLinePtrs.push(ptr);
    }
  }
  const vLinePtrs: number[] = [];
  for (let c = 0; c < model.colEdges.length; c++) {
    for (const seg of edgeSegments(model, "v", c)) {
      const ptr = emitLineRect(
        m,
        page,
        {
          x: model.colEdges[c] - t / 2,
          y: model.rowEdges[seg.to],
          width: t,
          height: model.rowEdges[seg.from] - model.rowEdges[seg.to],
        },
        model.lineColor,
      );
      if (ptr) vLinePtrs.push(ptr);
    }
  }
  model.hLinePtrs = hLinePtrs;
  model.vLinePtrs = vLinePtrs;
}

// Where the table's own text sits inside its cells. A new entry has to land on
// the same baseline and the same inset as the ones already there, so both are
// measured off the existing runs rather than re-derived from the cell box - a
// fixed pad puts new text a whole column-gap left of every neighbour.
interface CellMetrics {
  /** Baseline height above the row's bottom edge. */
  baselineOffset: number;
  /** Gap from the cell's left edge to the ink, per column. */
  leftInset: number[];
  /** Gap from the ink to the cell's right edge, per column. */
  rightInset: number[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureCells(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
): CellMetrics {
  const baselines: number[] = [];
  const lefts: number[][] = Array.from({ length: model.cols }, () => []);
  const rights: number[][] = Array.from({ length: model.cols }, () => []);
  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) {
      const id = model.cellRuns[r]?.[c];
      if (!id) continue;
      const run = page.findRun(id);
      if (!run) continue;
      baselines.push(run.matrix.f - model.rowEdges[r + 1]);
      const box = run.pdfiumObjPtr
        ? measureObjSpanPt(doc.module, [run.pdfiumObjPtr])
        : null;
      const left = box ? box.left : run.bounds.x;
      const right = box ? box.right : run.bounds.x + run.bounds.width;
      // A merged cell's inset is a property of the merge, not of any one
      // column, so it must not pollute the column's pool.
      if (model.spanAt(r, c).colSpan > 1) continue;
      lefts[c].push(left - model.colEdges[c]);
      rights[c].push(model.colEdges[c + 1] - right);
    }
  }
  const allLefts = lefts.flat();
  const allRights = rights.flat();
  const fallbackLeft = median(allLefts) ?? CELL_PAD;
  const fallbackRight = median(allRights) ?? CELL_PAD;
  return {
    baselineOffset: median(baselines) ?? -1,
    leftInset: lefts.map((xs) => Math.max(0, median(xs) ?? fallbackLeft)),
    rightInset: rights.map((xs) => Math.max(0, median(xs) ?? fallbackRight)),
  };
}

// The stretches of one grid edge that are actually drawn. An edge is skipped
// across any track where a merge straddles it; adjacent kept tracks are joined
// into one rect so an unmerged edge still emits a single object.
function edgeSegments(
  model: TableModel,
  axis: "h" | "v",
  index: number,
): { from: number; to: number }[] {
  const count = axis === "h" ? model.cols : model.rows;
  const out: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < count; i++) {
    const drawn =
      axis === "h"
        ? !straddlesRow(model, index, i)
        : !straddlesCol(model, index, i);
    if (drawn && start === null) start = i;
    if (!drawn && start !== null) {
      out.push({ from: start, to: i });
      start = null;
    }
  }
  if (start !== null) out.push({ from: start, to: count });
  return out;
}

/** True when a cell spans across horizontal edge `edge` in column `col`. */
function straddlesRow(model: TableModel, edge: number, col: number): boolean {
  for (let r = 0; r < edge; r++) {
    const span = model.cellSpans[r]?.[col];
    if (span && r + span.rowSpan > edge && col < model.cols) return true;
  }
  return false;
}

/** True when a cell spans across vertical edge `edge` in row `row`. */
function straddlesCol(model: TableModel, edge: number, row: number): boolean {
  for (let c = 0; c < edge; c++) {
    const span = model.cellSpans[row]?.[c];
    if (span && c + span.colSpan > edge) return true;
  }
  return false;
}

/** Baseline anchor (x, y) for text placed in a cell, before alignment. */
export function cellTextAnchor(
  model: TableModel,
  row: number,
  col: number,
): { x: number; y: number } {
  const rect = model.cellRect(row, col);
  const size = model.styleFor(row, col).fontSize;
  const baseline =
    rect.y + Math.max(CELL_PAD, (rect.height - size) / 2 + size * 0.2);
  return { x: rect.x + CELL_PAD, y: baseline };
}

// Write text into a cell in that column's own style - family, size, colour -
// and slide it to the column's alignment. The shift is measured off the emitted
// object rather than predicted, so it matches the glyphs PDFium actually laid.
export function emitStyledCellText(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
  row: number,
  col: number,
  text: string,
): EmittedText | null {
  const style = model.styleFor(row, col);
  const metrics = measureCells(doc, page, model);
  const rect = model.cellRect(row, col);
  const fallback = cellTextAnchor(model, row, col);
  // Sit on the table's own baseline when it has one; centre only in an empty
  // table where there is nothing to line up with.
  const baseline =
    metrics.baselineOffset >= 0
      ? model.rowEdges[row + 1] + metrics.baselineOffset
      : fallback.y;
  const leftInset = metrics.leftInset[col] ?? CELL_PAD;
  const emitted = emitCellText(
    doc,
    page,
    rect.x + leftInset,
    baseline,
    text,
    style.fontSize,
    style.fill,
    style.family,
  );
  if (!emitted) return null;
  const span = measureObjSpanPt(doc.module, [emitted.ptr]);
  if (span) {
    const width = span.right - span.left;
    const rightInset = metrics.rightInset[col] ?? CELL_PAD;
    let dx = 0;
    if (style.align === "right") {
      dx = rect.x + rect.width - rightInset - span.right;
    } else if (style.align === "center") {
      dx = rect.x + (rect.width - width) / 2 - span.left;
    }
    // An entry wider than its cell keeps its alignment; it is only stopped
    // from running out of the table.
    if (dx !== 0) {
      const clamped = Math.max(dx, model.colEdges[0] - span.left);
      shiftRunBy(doc.module, emitted.run, clamped, 0);
    }
    emitted.run.bounds = {
      ...emitted.run.bounds,
      x: emitted.run.bounds.x,
      width,
    };
  }
  return emitted;
}

export interface EmittedText {
  ptr: number;
  run: TextRun;
}

// Insert a base-14 (Helvetica) text object at a page-space point and register a
// matching run. Mirrors InsertTextCommand's core; used for cell content.
export function emitCellText(
  doc: EditorDocument,
  page: Page,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  fill: RGBA = BLACK,
  family: string = CELL_FAMILY,
): EmittedText | null {
  const m = doc.module;
  const sanitized = sanitizeForBase14(text);
  // PDFium can only build a text object for a base-14 name; a family it cannot
  // resolve returns 0, so fall back rather than dropping the text.
  const ptr =
    m.FPDFPageObj_NewTextObj(doc.docPtr, family, fontSize) ||
    m.FPDFPageObj_NewTextObj(doc.docPtr, CELL_FAMILY, fontSize);
  if (!ptr) return null;
  const textPtr = writeUtf16(m, sanitized);
  try {
    m.FPDFText_SetText(ptr, textPtr);
  } finally {
    m.pdfium.wasmExports.free(textPtr);
  }
  m.FPDFPageObj_SetFillColor(ptr, fill.r, fill.g, fill.b, fill.a);
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, x, y);
  m.FPDFPage_InsertObject(page.pagePtr, ptr);

  const runId = `p${page.index}-cell-${page.runs.length}-${ptr}`;
  // Measured, not estimated: a guessed box puts the editing overlay off the
  // glyphs until something recaptures the run, which is why new cell text
  // looked right only after a save.
  const measured = measureObjBoxPt(m, ptr);
  const run = new TextRun({
    id: runId,
    pageIndex: page.index,
    pdfiumObjPtr: ptr,
    bounds: measured ?? {
      x,
      y,
      width: Math.max(1, text.length * fontSize * 0.55),
      height: fontSize * 1.2,
    },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
    text,
    fontId: `base14:${family}`,
    fontSize,
    fill: { ...fill },
    fontSubset: false,
  });
  page.setRuns([...page.runs, run]);
  return { ptr, run };
}

/** Translate a run and its PDFium object by (dx, dy) page points. */
export function shiftRunBy(
  m: WrappedPdfiumModule,
  run: TextRun,
  dx: number,
  dy: number,
): void {
  if (dx === 0 && dy === 0) return;
  // Every object the run is built from, not just its representative: one run
  // can be a paragraph PDFium grouped from several text objects, and moving
  // only the first strands the rest where they were. OCR makes this obvious -
  // it emits an object per word - but any merged cell has the same shape.
  const members = new Set<number>();
  for (const ptr of run.paragraphLeafPtrs) if (ptr) members.add(ptr);
  for (const ptr of run.mergedFromPtrs) if (ptr) members.add(ptr);
  if (members.size === 0 && run.pdfiumObjPtr) members.add(run.pdfiumObjPtr);
  for (const ptr of members) {
    m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, dy);
  }
  run.matrix = { ...run.matrix, e: run.matrix.e + dx, f: run.matrix.f + dy };
  run.bounds = { ...run.bounds, x: run.bounds.x + dx, y: run.bounds.y + dy };
  run.dirty = true;
}

// Replace a table's grid with new edges, carrying each cell's text along with
// its cell so content keeps its position within the cell rather than being
// re-anchored. Used by every resize; reversible by calling it with the old
// edges.
export function setTableEdges(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
  colEdges: number[],
  rowEdges: number[],
): void {
  const moves: { run: TextRun; dx: number; dy: number }[] = [];
  for (let r = 0; r < model.cellRuns.length; r++) {
    for (let c = 0; c < model.cellRuns[r].length; c++) {
      const id = model.cellRuns[r][c];
      if (!id) continue;
      const run = page.findRun(id);
      if (!run) continue;
      const from = model.cellRect(r, c);
      const { colSpan } = model.spanAt(r, c);
      const nextEdge = colEdges[Math.min(c + colSpan, colEdges.length - 1)];
      // Follow the edge this entry is actually set against, judged from where
      // it sits now rather than from the column's style: a left-aligned header
      // over a right-aligned column has to track the left edge, or narrowing
      // the column from the left strands it on the wrong side of the divider.
      const span = run.pdfiumObjPtr
        ? measureObjSpanPt(doc.module, [run.pdfiumObjPtr])
        : null;
      const left = span ? span.left : run.bounds.x;
      const right = span ? span.right : run.bounds.x + run.bounds.width;
      const lead = left - from.x;
      const trail = from.x + from.width - right;
      // The entry moves BY the edge's delta, keeping whatever inset it had -
      // snapping it onto the edge instead would strip the cell's padding.
      const dx =
        Math.abs(lead - trail) <= ANCHOR_TOLERANCE_PT
          ? (colEdges[c] + nextEdge) / 2 - (from.x + from.width / 2)
          : trail < lead
            ? nextEdge - (from.x + from.width)
            : colEdges[c] - from.x;
      moves.push({ run, dx, dy: rowEdges[r + 1] - from.y });
      // Other runs in the same cell ride along with it.
      for (const extra of model.cellExtraRuns[r]?.[c] ?? []) {
        const other = page.findRun(extra);
        if (other) moves.push({ run: other, dx, dy: rowEdges[r + 1] - from.y });
      }
    }
  }
  model.colEdges = [...colEdges];
  model.rowEdges = [...rowEdges];
  renormaliseFontBase(model);
  for (const mv of moves) shiftRunBy(doc.module, mv.run, mv.dx, mv.dy);
  redrawGrid(doc, page, model);
}

// Keep the font reference in step with a size change that is NOT a content
// scale - an edge drag or an added column changes the table's extent without
// touching its type, and the reference has to move with it or the next scale
// would try to correct for it.
export function renormaliseFontBase(model: TableModel): void {
  const width = model.colEdges[model.colEdges.length - 1] - model.colEdges[0];
  const height = model.rowEdges[0] - model.rowEdges[model.rowEdges.length - 1];
  const scale = model.fontBase.scale || 1;
  if (width > 0) model.fontBase.width = width / scale;
  if (height > 0) model.fontBase.height = height / scale;
}

/** The content scale the table's CURRENT size calls for. */
export function absoluteFontScale(
  model: TableModel,
  colEdges: number[],
  rowEdges: number[],
): number {
  const width = colEdges[colEdges.length - 1] - colEdges[0];
  const height = rowEdges[0] - rowEdges[rowEdges.length - 1];
  if (model.fontBase.width <= 0 || model.fontBase.height <= 0) return 1;
  return Math.min(width / model.fontBase.width, height / model.fontBase.height);
}

// Where one cell's text sits relative to its cell, so it can be put back the
// same way after the grid changes shape. Scaling a table has to carry the text
// with it - moving it alone leaves entries hanging out of narrowed columns.
export interface CellPlacement {
  runId: string;
  row: number;
  col: number;
  anchor: "left" | "right" | "center";
  /** Gap from the anchor edge of its cell, in points. */
  inset: number;
  /** Baseline height above the row's bottom edge. */
  baseline: number;
}

export function captureCellPlacement(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
): CellPlacement[] {
  const out: CellPlacement[] = [];
  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) {
      const id = model.cellRuns[r]?.[c];
      if (!id) continue;
      const run = page.findRun(id);
      if (!run) continue;
      const cell = model.cellRect(r, c);
      const span = run.pdfiumObjPtr
        ? measureObjSpanPt(doc.module, [run.pdfiumObjPtr])
        : null;
      const left = span ? span.left : run.bounds.x;
      const right = span ? span.right : run.bounds.x + run.bounds.width;
      const lead = left - cell.x;
      const trail = cell.x + cell.width - right;
      const anchor =
        Math.abs(lead - trail) <= ANCHOR_TOLERANCE_PT
          ? "center"
          : trail < lead
            ? "right"
            : "left";
      out.push({
        runId: id,
        row: r,
        col: c,
        anchor,
        inset: anchor === "right" ? trail : lead,
        baseline: run.matrix.f - model.rowEdges[r + 1],
      });
    }
  }
  return out;
}

// Put each entry back at its captured position in the grid as it stands now,
// with insets and baselines scaled by `scale` so a resized table keeps its
// proportions rather than just its content.
export function applyCellPlacement(
  doc: EditorDocument,
  page: Page,
  model: TableModel,
  plan: CellPlacement[],
  scale: number,
): void {
  for (const spot of plan) {
    const run = page.findRun(spot.runId);
    if (!run) continue;
    if (spot.row >= model.rows || spot.col >= model.cols) continue;
    const span = run.pdfiumObjPtr
      ? measureObjSpanPt(doc.module, [run.pdfiumObjPtr])
      : null;
    const left = span ? span.left : run.bounds.x;
    const right = span ? span.right : run.bounds.x + run.bounds.width;
    const cellLeft = model.colEdges[spot.col];
    const cellRight =
      model.colEdges[
        Math.min(
          spot.col + model.spanAt(spot.row, spot.col).colSpan,
          model.cols,
        )
      ];
    const inset = spot.inset * scale;
    const dx =
      spot.anchor === "right"
        ? cellRight - inset - right
        : spot.anchor === "center"
          ? (cellLeft + cellRight) / 2 - (left + right) / 2
          : cellLeft + inset - left;
    const targetBaseline = model.rowEdges[spot.row + 1] + spot.baseline * scale;
    const dy = targetBaseline - run.matrix.f;
    shiftRunBy(doc.module, run, dx, dy);
    for (const extra of model.cellExtraRuns[spot.row]?.[spot.col] ?? []) {
      const other = page.findRun(extra);
      if (other) shiftRunBy(doc.module, other, dx, dy);
    }
  }
}
