// Pure grid-geometry maths for structural table edits. Column edges run
// left-to-right (ascending x); row edges run top-to-bottom (DESCENDING y, PDF
// points). Kept free of PDFium so the arithmetic can be unit-tested directly.

export interface EdgeEdit {
  /** The boundary array after the edit. */
  edges: number[];
  // How much each existing track index shifts, and by how far, so the caller
  // can move the runs that live in those tracks. delta is in PDF points.
  shift: { fromIndex: number; delta: number };
}

/** Insert a new column at slot `k` (0..cols) of width `w`. */
export function insertColumnEdges(
  colEdges: number[],
  k: number,
  w: number,
): EdgeEdit {
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(colEdges[i]);
  out.push(colEdges[k]);
  for (let i = k; i < colEdges.length; i++) out.push(colEdges[i] + w);
  return { edges: out, shift: { fromIndex: k, delta: w } };
}

/** Remove column `k`; tracks to its right shift left by the column's width. */
export function removeColumnEdges(colEdges: number[], k: number): EdgeEdit {
  const w = colEdges[k + 1] - colEdges[k];
  const out: number[] = [];
  for (let i = 0; i < colEdges.length; i++) {
    if (i === k + 1) continue;
    out.push(i <= k ? colEdges[i] : colEdges[i] - w);
  }
  return { edges: out, shift: { fromIndex: k + 1, delta: -w } };
}

/** Insert a new row at slot `k` (0..rows) of height `h`; rows below drop. */
export function insertRowEdges(
  rowEdges: number[],
  k: number,
  h: number,
): EdgeEdit {
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(rowEdges[i]);
  out.push(rowEdges[k]);
  // Rows below the insertion move DOWN (y decreases) by h.
  for (let i = k; i < rowEdges.length; i++) out.push(rowEdges[i] - h);
  return { edges: out, shift: { fromIndex: k, delta: -h } };
}

/** Remove row `k`; rows below shift up (y increases) by the row's height. */
export function removeRowEdges(rowEdges: number[], k: number): EdgeEdit {
  const h = rowEdges[k] - rowEdges[k + 1];
  const out: number[] = [];
  for (let i = 0; i < rowEdges.length; i++) {
    if (i === k + 1) continue;
    out.push(i <= k ? rowEdges[i] : rowEdges[i] + h);
  }
  return { edges: out, shift: { fromIndex: k + 1, delta: h } };
}

/** Uniform column edges spanning [x, x+width] across `cols` columns. */
export function uniformColumnEdges(
  x: number,
  width: number,
  cols: number,
): number[] {
  const step = width / cols;
  return Array.from({ length: cols + 1 }, (_, i) => x + i * step);
}

// Uniform row edges spanning [topY-height, topY] across `rows` rows, returned
// top-to-bottom (descending y).
export function uniformRowEdges(
  topY: number,
  height: number,
  rows: number,
): number[] {
  const step = height / rows;
  return Array.from({ length: rows + 1 }, (_, i) => topY - i * step);
}

/** Smallest column width / row height a resize may produce, in points. */
export const MIN_TRACK = 8;

// Move internal column edge `k` to x, absorbing the change into the two columns
// either side; every other edge holds still. Clamped so neither neighbour falls
// below `min`. Outer edges (k = 0 or last) are not movable: resizing the table
// as a whole is `scaleColumnEdges`.
export function moveColumnEdge(
  colEdges: number[],
  k: number,
  x: number,
  min: number = MIN_TRACK,
): number[] {
  const out = [...colEdges];
  if (k <= 0 || k >= colEdges.length - 1) return out;
  const lo = colEdges[k - 1] + min;
  const hi = colEdges[k + 1] - min;
  if (hi < lo) return out;
  out[k] = Math.min(Math.max(x, lo), hi);
  return out;
}

// Move internal row edge `k` to y. Row edges descend, so the edge above bounds
// it from ABOVE and the edge below from below.
export function moveRowEdge(
  rowEdges: number[],
  k: number,
  y: number,
  min: number = MIN_TRACK,
): number[] {
  const out = [...rowEdges];
  if (k <= 0 || k >= rowEdges.length - 1) return out;
  const hi = rowEdges[k - 1] - min;
  const lo = rowEdges[k + 1] + min;
  if (hi < lo) return out;
  out[k] = Math.min(Math.max(y, lo), hi);
  return out;
}

/** Rescale columns to span `width` from the left edge, keeping their ratios. */
export function scaleColumnEdges(
  colEdges: number[],
  width: number,
  min: number = MIN_TRACK,
): number[] {
  const cols = colEdges.length - 1;
  if (cols < 1) return [...colEdges];
  const x0 = colEdges[0];
  const span = colEdges[cols] - x0;
  const target = Math.max(width, min * cols);
  if (span <= 0) return uniformColumnEdges(x0, target, cols);
  const k = target / span;
  return colEdges.map((x) => x0 + (x - x0) * k);
}

/** Rescale rows to span `height` down from the top edge, keeping their ratios. */
export function scaleRowEdges(
  rowEdges: number[],
  height: number,
  min: number = MIN_TRACK,
): number[] {
  const rows = rowEdges.length - 1;
  if (rows < 1) return [...rowEdges];
  const y0 = rowEdges[0];
  const span = y0 - rowEdges[rows];
  const target = Math.max(height, min * rows);
  if (span <= 0) return uniformRowEdges(y0, target, rows);
  const k = target / span;
  return rowEdges.map((y) => y0 - (y0 - y) * k);
}

// Resize the single track BEFORE edge `k`, sliding everything after it along.
// Unlike moveColumnEdge, which makes two neighbours trade width at a fixed
// table size, this changes one column and the table grows or shrinks with it.
export function resizeColumnTrack(
  colEdges: number[],
  k: number,
  x: number,
  min: number = MIN_TRACK,
): number[] {
  if (k < 1 || k > colEdges.length - 1) return [...colEdges];
  const clamped = Math.max(x, colEdges[k - 1] + min);
  const delta = clamped - colEdges[k];
  return colEdges.map((v, i) => (i >= k ? v + delta : v));
}

/** As resizeColumnTrack, for the row above edge `k` (edges descend in y). */
export function resizeRowTrack(
  rowEdges: number[],
  k: number,
  y: number,
  min: number = MIN_TRACK,
): number[] {
  if (k < 1 || k > rowEdges.length - 1) return [...rowEdges];
  const clamped = Math.min(y, rowEdges[k - 1] - min);
  const delta = clamped - rowEdges[k];
  return rowEdges.map((v, i) => (i >= k ? v + delta : v));
}
