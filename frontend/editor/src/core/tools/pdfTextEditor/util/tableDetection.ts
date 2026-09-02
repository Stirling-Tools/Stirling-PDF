import type {
  PageRect,
  TableCellSnapshot,
  TableSnapshot,
  TextRunSnapshot,
} from "@app/tools/pdfTextEditor/types";

// Recognizes tabular layouts from a page's text runs. PDF has no native table
// object, so a "table" here is a derived grid: runs that line up into shared
// columns across several vertically-stacked rows. Pure and deterministic so it
// can be unit-tested without PDFium.

export interface TableDetectionOptions {
  // Two runs share a row when their vertical centres are within this fraction
  // of the median run height.
  rowTolFactor: number;
  // Two left edges share a column when within this fraction of median height.
  colTolFactor: number;
  // A vertical gap larger than this many row-heights breaks one table into two.
  maxRowGapFactor: number;
  /** Minimum rows for a run block to count as a table. */
  minRows: number;
  /** Minimum columns for a run block to count as a table. */
  minCols: number;
}

// A rule counts as part of the grid only if it runs along most of the table.
const RULE_COVERAGE = 0.5;
/** How far outside the derived bounds a rule may still be the table's own. */
const RULE_EDGE_MARGIN_PT = 12;
/** A gap this many times the table's usual row gap ends the table. */
const ROW_GAP_TOLERANCE = 2;

export const DEFAULT_TABLE_OPTIONS: TableDetectionOptions = {
  rowTolFactor: 0.6,
  colTolFactor: 0.9,
  maxRowGapFactor: 2.5,
  minRows: 2,
  minCols: 2,
};

interface Cand {
  run: TextRunSnapshot;
  left: number;
  right: number;
  cx: number;
  cy: number;
  height: number;
}

interface Row {
  cands: Cand[];
  cy: number;
  top: number;
  bottom: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// One candidate box per line of text. A table cell is a single line, but the
// editor's paragraph grouping merges a whole table COLUMN into one multi-line
// run, so a run must be expanded into its member lines or the cells never
// appear. Returns [] for anything that cannot contribute.
function toCandidates(run: TextRunSnapshot): Cand[] {
  if (run.locked) return [];
  if (!run.text || run.text.trim().length === 0) return [];
  const { x, y, width, height } = run.bounds;
  if (width <= 0 || height <= 0) return [];
  const lines = run.paragraphLineCount ?? 1;
  if (lines <= 1) {
    return [
      {
        run,
        left: x,
        right: x + width,
        cx: x + width / 2,
        cy: y + height / 2,
        height,
      },
    ];
  }
  return expandParagraph(run, lines);
}

// Split a multi-line run using the per-line geometry PDFium gave us. Baselines
// and lefts are exact; only each line's width is estimated, from its share of
// the longest line's character count.
function expandParagraph(run: TextRunSnapshot, lines: number): Cand[] {
  const baselines = run.paragraphBaselines;
  const lefts = run.paragraphLineLefts;
  const texts = run.text.split("\n");
  // Without real baselines the line boxes would be guesswork, and a wrong row
  // band is worse than no candidate.
  if (!baselines || baselines.length !== lines || texts.length < lines)
    return [];
  const { x, y, width, height } = run.bounds;
  // The run's box spans the first line's ascent to the last line's descent, so
  // the per-line box follows from its own baseline.
  const descent = baselines[lines - 1] - y;
  const ascent = y + height - baselines[0];
  const lineHeight = ascent + descent;
  if (lineHeight <= 0) return [];
  const lengths = texts.slice(0, lines).map((s) => s.trim().length);
  const maxLen = Math.max(...lengths, 1);
  const out: Cand[] = [];
  for (let i = 0; i < lines; i++) {
    if (lengths[i] === 0) continue;
    const left = lefts?.[i] ?? x;
    const w = Math.max(1, (width * lengths[i]) / maxLen);
    const bottom = baselines[i] - descent;
    out.push({
      run,
      left,
      right: left + w,
      cx: left + w / 2,
      cy: bottom + lineHeight / 2,
      height: lineHeight,
    });
  }
  return out;
}

// Cluster candidates into rows by vertical-centre proximity, top-down.
function groupRows(cands: Cand[], rowTol: number): Row[] {
  const sorted = [...cands].sort((a, b) => b.cy - a.cy);
  const rows: Row[] = [];
  let current: Cand[] = [];
  let ref = 0;
  for (const c of sorted) {
    if (current.length === 0 || Math.abs(c.cy - ref) <= rowTol) {
      if (current.length === 0) ref = c.cy;
      current.push(c);
      // Track the row centre as a running mean so a slightly drifting baseline
      // does not split one visual row in two.
      ref = current.reduce((s, x) => s + x.cy, 0) / current.length;
    } else {
      rows.push(finishRow(current));
      current = [c];
      ref = c.cy;
    }
  }
  if (current.length > 0) rows.push(finishRow(current));
  return rows;
}

// The row's extent comes from the LINE boxes in it. Taking the parent run's
// box instead collapses every row of a paragraph-merged column onto the same
// top and bottom, and the derived row edges come out identical - a grid of
// zero-height rows.
function finishRow(cands: Cand[]): Row {
  const ordered = [...cands].sort((a, b) => a.left - b.left);
  const tops = ordered.map((c) => c.cy + c.height / 2);
  const bottoms = ordered.map((c) => c.cy - c.height / 2);
  return {
    cands: ordered,
    cy: ordered.reduce((s, c) => s + c.cy, 0) / ordered.length,
    top: Math.max(...tops),
    bottom: Math.min(...bottoms),
  };
}

interface Band {
  left: number;
  right: number;
}

// Columns as vertical whitespace bands: merge the runs' x-intervals, splitting
// only where a gap wider than `minGap` separates them. Alignment-agnostic, so a
// right-aligned numeric column (varying lefts, shared band) stays one column.
function columnBands(cands: Cand[], minGap: number): Band[] {
  const intervals = cands
    .map((c) => ({ left: c.left, right: c.right }))
    .sort((a, b) => a.left - b.left);
  const bands: Band[] = [];
  for (const iv of intervals) {
    const last = bands[bands.length - 1];
    if (last && iv.left - last.right <= minGap) {
      last.right = Math.max(last.right, iv.right);
    } else {
      bands.push({ left: iv.left, right: iv.right });
    }
  }
  return bands;
}

// Two adjacent bands that never both appear in one row are one column whose
// entries are aligned differently - a left-aligned header sitting above a
// right-aligned number column leaves a whitespace gap between them, which would
// otherwise split that column in two.
function mergeAlignmentBands(bands: Band[], rows: Row[]): Band[] {
  let merged = bands;
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let i = 0; i < merged.length - 1; i++) {
      const together = rows.some((r) => {
        let a = false;
        let b = false;
        for (const c of r.cands) {
          const idx = bandIndex(merged, c.cx);
          if (idx === i) a = true;
          else if (idx === i + 1) b = true;
        }
        return a && b;
      });
      if (together) continue;
      merged = [
        ...merged.slice(0, i),
        { left: merged[i].left, right: merged[i + 1].right },
        ...merged.slice(i + 2),
      ];
      changed = true;
      break;
    }
  }
  return merged;
}

// A drawn rule reduced to the coordinate it pins and the span it runs along.
interface RuleLine {
  at: number;
  from: number;
  to: number;
}

// Collinear pieces are one line. A grid of stroked cells contributes each
// boundary once per cell, so without joining them no single piece ever spans
// enough of the table to be recognized as one of its rules.
const RULE_COLLINEAR_EPS = 0.75;
const RULE_JOIN_GAP = 2;

function ruleLines(rules: PageRect[], vertical: boolean): RuleLine[] {
  const pieces: RuleLine[] = [];
  for (const r of rules) {
    if (r.width <= r.height !== vertical) continue;
    pieces.push(
      vertical
        ? { at: r.x + r.width / 2, from: r.y, to: r.y + r.height }
        : { at: r.y + r.height / 2, from: r.x, to: r.x + r.width },
    );
  }
  pieces.sort((a, b) => a.at - b.at || a.from - b.from);
  const out: RuleLine[] = [];
  for (const piece of pieces) {
    const last = out[out.length - 1];
    if (
      last &&
      Math.abs(piece.at - last.at) <= RULE_COLLINEAR_EPS &&
      piece.from <= last.to + RULE_JOIN_GAP
    ) {
      last.to = Math.max(last.to, piece.to);
      continue;
    }
    out.push({ ...piece });
  }
  return out;
}

// The rules that belong to this table are the ones running along most of it. A
// stray underline or a page border only clips a corner and is dropped.
function pinsAcross(
  lines: RuleLine[],
  lo: number,
  hi: number,
  minCover: number,
  atLo: number,
  atHi: number,
): number[] {
  const span = hi - lo;
  if (span <= 0) return [];
  const hits = lines
    .filter(
      (l) =>
        // Running the length of the table is not enough on its own: a second
        // table further down the page has rules just as wide, and taking those
        // in wrecks the grid. The line must sit within this table's extent too.
        l.at >= atLo - RULE_EDGE_MARGIN_PT &&
        l.at <= atHi + RULE_EDGE_MARGIN_PT &&
        (Math.min(l.to, hi) - Math.max(l.from, lo)) / span >= minCover,
    )
    .map((l) => l.at)
    .sort((a, b) => a - b);
  const merged: number[] = [];
  for (const v of hits) {
    if (merged.length > 0 && v - merged[merged.length - 1] < 0.75) continue;
    merged.push(v);
  }
  return merged;
}

// Move derived edges onto the lines the page actually draws. Text-derived edges
// sit at the midpoint of the whitespace between columns, which is not where the
// rule is - up to ~10pt out on a wide column - so the overlay reads as skewed
// against a table the reader can see the borders of.
// True when the drawn lines put every track's content in its OWN cell, in
// order. Matching counts alone is not evidence: a page border plus some
// unrelated graphics can add up to the right number of lines in the wrong
// places, and adopting those would shred the grid.
function pinsSeparate(centres: number[], pins: number[]): boolean {
  if (pins.length !== centres.length + 1) return false;
  const sorted = [...centres].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= pins[i] || sorted[i] >= pins[i + 1]) return false;
  }
  return true;
}

function snapAxis(
  edges: number[],
  pins: number[],
  centres: number[],
  tol: number,
): { edges: number[]; drawn: boolean } {
  if (pins.length === 0) return { edges, drawn: false };
  const descending = edges[0] > edges[edges.length - 1];
  // The drawn grid separates exactly the tracks we derived: it IS the table.
  if (pinsSeparate(centres, pins)) {
    return { edges: descending ? [...pins].reverse() : pins, drawn: true };
  }
  const snapped = edges.map((e) => {
    let best = e;
    let bestDist = tol;
    for (const p of pins) {
      const d = Math.abs(p - e);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  });
  // Two edges landing on one rule would collapse a track; keep the derived set.
  for (let i = 1; i < snapped.length; i++) {
    const ordered = descending
      ? snapped[i] < snapped[i - 1]
      : snapped[i] > snapped[i - 1];
    if (!ordered) return { edges, drawn: false };
  }
  return { edges: snapped, drawn: false };
}

// A column boundary the page draws, and which of the table's rows it actually
// separates. A merged cell shows up as a boundary that is simply ABSENT over
// the rows it spans, so the rule's vertical coverage IS the merge structure.
export interface ColumnPin {
  at: number;
  /** Indices of the row bands this boundary is drawn across. */
  rows: Set<number>;
}

/** A rule counts as separating a row when it covers most of that row's band. */
const PIN_ROW_COVERAGE = 0.6;
/** How far past the text extent a column boundary may sit, as a width share. */
const PIN_EDGE_MARGIN_FRACTION = 0.2;

// A row boundary the page draws, and which columns it is drawn across. A cell
// merged DOWNWARDS shows up as a boundary that skips its column.
export interface RowPin {
  at: number;
  cols: Set<number>;
}

/** Row boundaries the page draws over a span of the page, top-down. */
export function rowPins(
  lines: RuleLine[],
  colEdges: number[],
  lo: number,
  hi: number,
): RowPin[] {
  const cols = colEdges.length - 1;
  const margin = Math.max(
    RULE_EDGE_MARGIN_PT,
    (hi - lo) * PIN_EDGE_MARGIN_FRACTION,
  );
  const out: RowPin[] = [];
  for (const line of lines) {
    if (line.at < lo - margin || line.at > hi + margin) continue;
    const covered = new Set<number>();
    for (let c = 0; c < cols; c++) {
      const width = colEdges[c + 1] - colEdges[c];
      if (width <= 0) continue;
      const overlap =
        Math.min(line.to, colEdges[c + 1]) - Math.max(line.from, colEdges[c]);
      if (overlap / width >= PIN_ROW_COVERAGE) covered.add(c);
    }
    if (covered.size === 0) continue;
    const near = out.find((p) => Math.abs(p.at - line.at) < 0.75);
    if (near) {
      for (const c of covered) near.cols.add(c);
    } else {
      out.push({ at: line.at, cols: covered });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

// Split the page's row boundaries into one group per table: a gap much larger
// than the usual row spacing is the space between two tables, not a tall row.
export function clusterRowPins(pins: RowPin[]): RowPin[][] {
  if (pins.length < 2) return pins.length > 0 ? [pins] : [];
  const gaps: number[] = [];
  for (let i = 1; i < pins.length; i++) gaps.push(pins[i - 1].at - pins[i].at);
  const typical = median(gaps.filter((g) => g > 0));
  const limit = typical > 0 ? typical * ROW_GAP_TOLERANCE : Infinity;
  const out: RowPin[][] = [[pins[0]]];
  for (let i = 1; i < pins.length; i++) {
    if (pins[i - 1].at - pins[i].at > limit) out.push([]);
    out[out.length - 1].push(pins[i]);
  }
  return out;
}

// Re-band candidates onto the row boundaries the page draws. Text banding
// cannot see a vertically merged cell: its text is centred over the rows it
// spans, so it lands between them and tears the table in two.
export function bandByRules(cands: Cand[], pins: RowPin[]): Row[] | null {
  if (pins.length < 3) return null;
  const rows: Row[] = [];
  for (let i = 0; i < pins.length - 1; i++) {
    const hi = pins[i].at;
    const lo = pins[i + 1].at;
    const inBand = cands.filter((c) => c.cy <= hi && c.cy >= lo);
    rows.push({
      cands: [...inBand].sort((a, b) => a.left - b.left),
      cy: (hi + lo) / 2,
      top: hi,
      bottom: lo,
    });
  }
  return rows;
}

// Unlike the horizontal pins, a vertical rule is kept even when it spans only
// part of the table: covering one row band is enough to make it a real column
// boundary, and the rows it misses are the merges.
export function columnPins(
  lines: RuleLine[],
  rows: Row[],
  atLo: number,
  atHi: number,
): ColumnPin[] {
  // The derived box comes from TEXT, so it can sit most of a column's padding
  // inside the drawn frame - on the merged-cell fixture the outer rule was 34pt
  // beyond it. Requiring the rule to cross this table's own row bands is the
  // real filter, so the horizontal window can be generous.
  const margin = Math.max(
    RULE_EDGE_MARGIN_PT,
    (atHi - atLo) * PIN_EDGE_MARGIN_FRACTION,
  );
  const out: ColumnPin[] = [];
  for (const line of lines) {
    if (line.at < atLo - margin) continue;
    if (line.at > atHi + margin) continue;
    const covered = new Set<number>();
    for (let r = 0; r < rows.length; r++) {
      const band = rows[r].top - rows[r].bottom;
      if (band <= 0) continue;
      const overlap =
        Math.min(line.to, rows[r].top) - Math.max(line.from, rows[r].bottom);
      if (overlap / band >= PIN_ROW_COVERAGE) covered.add(r);
    }
    if (covered.size === 0) continue;
    const near = out.find((p) => Math.abs(p.at - line.at) < 0.75);
    if (near) {
      for (const r of covered) near.rows.add(r);
    } else {
      out.push({ at: line.at, rows: covered });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Cells of one row, as [startCol, endCol] ranges. A boundary the page does not
// draw across this row does not divide it, so the columns either side are one
// merged cell.
export function rowSpans(
  pins: ColumnPin[],
  cols: number,
  row: number,
): { start: number; span: number }[] {
  const out: { start: number; span: number }[] = [];
  let start = 0;
  for (let c = 1; c < cols; c++) {
    // pins[c] is the boundary between column c-1 and column c: the outer edge
    // is pins[0], so interior boundary c sits at index c.
    const pin = pins[c];
    if (pin && !pin.rows.has(row)) continue;
    out.push({ start, span: c - start });
    start = c;
  }
  out.push({ start, span: cols - start });
  return out;
}

/** Index of the track in `edges` containing `x`, clamped to the outer tracks. */ // How far a cell reaches downwards: while the boundary below it is not drawn
// across every column it occupies, it is one merged cell.
function downSpan(
  pins: RowPin[],
  rows: number,
  row: number,
  start: number,
  span: number,
): number {
  let reach = 1;
  while (row + reach < rows) {
    const pin = pins[row + reach];
    if (!pin) break;
    let dividesAll = true;
    for (let c = start; c < start + span; c++) {
      if (!pin.cols.has(c)) dividesAll = false;
    }
    if (dividesAll) break;
    reach++;
  }
  return reach;
}

/** Index of the track in `edges` containing `x`, clamped to the outer tracks. */
function edgeIndex(edges: number[], x: number): number {
  const descending = edges[0] > edges[edges.length - 1];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = descending ? edges[i + 1] : edges[i];
    const hi = descending ? edges[i] : edges[i + 1];
    if (x >= lo && x <= hi) return i;
  }
  const firstMid = (edges[0] + edges[1]) / 2;
  return Math.abs(x - firstMid) <= Math.abs(x - edges[edges.length - 1])
    ? 0
    : edges.length - 2;
}

/** Index of the band whose span contains `x`, else the nearest by centre. */
function bandIndex(bands: Band[], x: number): number {
  for (let i = 0; i < bands.length; i++) {
    if (x >= bands[i].left && x <= bands[i].right) return i;
  }
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < bands.length; i++) {
    const centre = (bands[i].left + bands[i].right) / 2;
    const d = Math.abs(centre - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Drop single-cell rows from the top and bottom of a block. A heading above a
// table, or a prose line tight beneath it, sits too close for the gap rule to
// separate but spans only one column, so it is not a row of the grid.
function trimEdgeRows(block: Row[]): Row[] {
  let start = 0;
  let end = block.length;
  while (start < end && block[start].cands.length < 2) start++;
  while (end > start && block[end - 1].cands.length < 2) end--;
  return block.slice(start, end);
}

// Split rows into vertically-contiguous blocks: a large vertical gap ends a
// table (e.g. the gap between a table and the paragraph beneath it).
//
// "Large" is measured against the page's own row pitch, not against the glyph
// height. A generously spaced table - a form, a padded invoice, the text layer
// over a scan - has rows several times the type size apart, and a fixed
// multiple of the type size cut every one of those tables into single rows.
function splitBlocks(rows: Row[], minGap: number): Row[][] {
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    gaps.push(rows[i - 1].bottom - rows[i].top);
  }
  const typical = median(gaps.filter((g) => g > 0));
  const maxGap = Math.max(minGap, typical * ROW_GAP_TOLERANCE);
  const blocks: Row[][] = [];
  let current: Row[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (current.length === 0) {
      current.push(rows[i]);
      continue;
    }
    const prev = current[current.length - 1];
    const gap = prev.bottom - rows[i].top;
    if (gap > maxGap) {
      blocks.push(current);
      current = [rows[i]];
    } else {
      current.push(rows[i]);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function buildTable(
  block: Row[],
  bands: Band[],
  pageIndex: number,
  index: number,
  opts: TableDetectionOptions,
  rules: PageRect[],
  snapTol: number,
): TableSnapshot | null {
  const cols = bands.length;
  const rows = block.length;
  if (rows < opts.minRows || cols < opts.minCols) return null;

  // Inner edges sit at the midpoint of the whitespace between tracks. The outer
  // ones get the SAME half-gap as a margin: taking the glyph extent instead
  // makes the boundary graze the first and last row's text, which reads as a
  // misdrawn grid on a table that has no printed border to check it against.
  const colGaps: number[] = [];
  for (let i = 1; i < cols; i++)
    colGaps.push(bands[i].left - bands[i - 1].right);
  const colPad = Math.max(1, median(colGaps) / 2);
  const derivedCols: number[] = [bands[0].left - colPad];
  for (let i = 1; i < cols; i++) {
    derivedCols.push((bands[i - 1].right + bands[i].left) / 2);
  }
  derivedCols.push(bands[cols - 1].right + colPad);

  const rowGaps: number[] = [];
  for (let i = 1; i < rows; i++)
    rowGaps.push(block[i - 1].bottom - block[i].top);
  const rowPad = Math.max(1, median(rowGaps) / 2);
  const derivedRows: number[] = [block[0].top + rowPad];
  for (let i = 1; i < rows; i++) {
    derivedRows.push((block[i - 1].bottom + block[i].top) / 2);
  }
  derivedRows.push(block[rows - 1].bottom - rowPad);

  // Vertical boundaries come with the rows they are drawn across, so a rule
  // that stops short is a merge rather than a rule to throw away.
  const pins = columnPins(
    ruleLines(rules, true),
    block,
    derivedCols[0],
    derivedCols[cols],
  );
  const snappedCols = snapAxis(
    derivedCols,
    pins.map((p) => p.at),
    bands.map((b) => (b.left + b.right) / 2),
    snapTol,
  );
  const colEdges = snappedCols.edges;
  const snappedRows = snapAxis(
    derivedRows,
    pinsAcross(
      ruleLines(rules, false),
      colEdges[0],
      colEdges[cols],
      RULE_COVERAGE,
      derivedRows[rows],
      derivedRows[0],
    ),
    block.map((r) => r.cy),
    snapTol,
  );
  const rowEdges = snappedRows.edges;

  // Spans are only trustworthy when the drawn boundaries ARE the columns; a
  // grid inferred from whitespace has no evidence about what is merged.
  const spannable = snappedCols.drawn && pins.length === cols + 1;
  // The row boundaries as drawn, so a boundary that skips a column reads as a
  // cell merged downwards.
  const hPins = rowPins(
    ruleLines(rules, false),
    colEdges,
    rowEdges[rows],
    rowEdges[0],
  );
  const downMergeable = spannable && hPins.length === rows + 1;
  const byCol = block.map((row) => {
    const map = new Map<number, string[]>();
    for (const c of row.cands) {
      const col = edgeIndex(colEdges, c.cx);
      const list = map.get(col) ?? [];
      list.push(c.run.id);
      map.set(col, list);
    }
    return map;
  });

  const cells: TableCellSnapshot[] = [];
  const covered = new Set<string>();
  let occupiedCells = 0;
  for (let r = 0; r < rows; r++) {
    const spans = spannable
      ? rowSpans(pins, cols, r)
      : Array.from({ length: cols }, (_, col) => ({ start: col, span: 1 }));
    for (const { start, span } of spans) {
      if (covered.has(`${r},${start}`)) continue;
      const rowSpan = downMergeable ? downSpan(hPins, rows, r, start, span) : 1;
      const runIds: string[] = [];
      for (let rr = r; rr < r + rowSpan; rr++) {
        for (let col = start; col < start + span; col++) {
          runIds.push(...(byCol[rr]?.get(col) ?? []));
        }
      }
      for (let rr = r; rr < r + rowSpan; rr++) {
        for (let cc = start; cc < start + span; cc++) {
          if (rr !== r || cc !== start) covered.add(`${rr},${cc}`);
        }
      }
      if (runIds.length > 0) occupiedCells++;
      cells.push({
        row: r,
        col: start,
        runIds,
        colSpan: span,
        rowSpan,
        rect: {
          x: colEdges[start],
          y: rowEdges[r + rowSpan],
          width: colEdges[start + span] - colEdges[start],
          height: rowEdges[r] - rowEdges[r + rowSpan],
        },
      });
    }
  }

  // Reject prose masquerading as a table: a real grid fills a good share of its
  // cells and has multiple rows contributing to each column alignment.
  const fill = occupiedCells / cells.length;
  if (fill < 0.4) return null;
  const rowsWithMultipleCols = block.filter(
    (r) => new Set(r.cands.map((c) => edgeIndex(colEdges, c.cx))).size >= 2,
  ).length;
  if (rowsWithMultipleCols < 2) return null;

  const bounds: PageRect = {
    x: colEdges[0],
    y: rowEdges[rows],
    width: colEdges[cols] - colEdges[0],
    height: rowEdges[0] - rowEdges[rows],
  };
  const confidence = Math.min(
    1,
    0.5 * fill + 0.5 * (rowsWithMultipleCols / rows),
  );

  return {
    id: `p${pageIndex}-table-${index}`,
    pageIndex,
    rows,
    cols,
    colEdges,
    rowEdges,
    bounds,
    cells,
    confidence,
    synthetic: false,
    // Only adoption can tell: it needs the render modes behind the text.
    scanned: false,
    ruled: false,
    pageRuled: snappedCols.drawn && snappedRows.drawn,
    adopted: false,
    // Styles are read off the runs when the table is adopted for editing.
    columnStyles: [],
    headerStyle: null,
  };
}

/** Recognize tables on one page from its text-run snapshots. */
export function detectTables(
  runs: TextRunSnapshot[],
  pageIndex: number,
  options: Partial<TableDetectionOptions> = {},
  rules: PageRect[] = [],
): TableSnapshot[] {
  const opts = { ...DEFAULT_TABLE_OPTIONS, ...options };
  const cands = runs.flatMap(toCandidates);
  if (cands.length < opts.minRows * opts.minCols) return [];

  const medHeight = median(cands.map((c) => c.height)) || 1;
  const rowTol = medHeight * opts.rowTolFactor;
  // Minimum whitespace between columns, scaled to the text size.
  const minColGap = Math.max(3, medHeight * opts.colTolFactor);
  const maxGap = medHeight * opts.maxRowGapFactor;

  // Where the page draws a set of row boundaries, they define the rows for the
  // candidates they enclose. Splitting on text gaps alone tears a vertically
  // merged table in two, because the merged cell's text is centred over the
  // rows it spans and so lands between them.
  const allPins = rowPins(
    ruleLines(rules, false),
    [
      Math.min(...cands.map((c) => c.left)),
      Math.max(...cands.map((c) => c.right)),
    ],
    Math.min(...cands.map((c) => c.cy)),
    Math.max(...cands.map((c) => c.cy)),
  );
  const blocks: Row[][] = [];
  const claimed = new Set<Cand>();
  for (const group of clusterRowPins(allPins)) {
    if (group.length < 3) continue;
    const top = group[0].at;
    const bottom = group[group.length - 1].at;
    const inside = cands.filter((c) => c.cy <= top && c.cy >= bottom);
    if (inside.length < opts.minRows * opts.minCols) continue;
    const banded = bandByRules(inside, group);
    if (!banded) continue;
    blocks.push(banded);
    for (const c of inside) claimed.add(c);
  }
  // Whatever the rules did not claim still goes through text banding.
  const loose = cands.filter((c) => !claimed.has(c));
  if (loose.length > 0) {
    blocks.push(
      ...splitBlocks(
        groupRows(loose, rowTol).filter((r) => r.cands.length >= 1),
        maxGap,
      ),
    );
  }

  const tables: TableSnapshot[] = [];
  for (const raw of blocks) {
    const block = trimEdgeRows(raw);
    // A table needs several rows that each span multiple columns. Derive the
    // column bands from rows that already carry 2+ runs, so a stray full-width
    // heading line does not smear the bands together.
    const multiRunRows = block.filter((r) => r.cands.length >= 2);
    if (multiRunRows.length < opts.minRows) continue;
    const bands = mergeAlignmentBands(
      columnBands(
        multiRunRows.flatMap((r) => r.cands),
        minColGap,
      ),
      block,
    );
    const table = buildTable(
      block,
      bands,
      pageIndex,
      tables.length,
      opts,
      rules,
      Math.max(4, medHeight * 1.5),
    );
    if (table) tables.push(table);
  }
  return tables;
}
