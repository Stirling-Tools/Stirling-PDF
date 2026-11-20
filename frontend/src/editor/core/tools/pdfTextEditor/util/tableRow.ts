import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** How far, in line heights, the next row of a table sits from a row of it. */
const ROW_REACH = 3;
/** Blocks on a line, and columns it shares with a row near it, that make it a table row. */
const MIN_COLUMNS = 2;
/**
 * Comparisons one page may spend finding rows. A real page spends a few
 * thousand; a page drawn to make the search quadratic, such as thousands of
 * tall runs on one line, stops here instead of hanging the tab.
 */
const MAX_COMPARISONS = 1_000_000;

interface Budget {
  left: number;
}

/** A run's box as the page is displayed: x across, y up the displayed page. */
interface Placed<R> {
  run: R;
  key: string;
  left: number;
  right: number;
  low: number;
  high: number;
  middle: number;
  half: number;
}

interface Row<R> {
  cells: Placed<R>[];
  low: number;
  high: number;
  middle: number;
  /** Half its shortest cell's height: a line of the row, where a cell may wrap. */
  lineHalf: number;
}

/**
 * The runs of one page that sit on a line with `cells` runs of the same
 * `keyOf`, themselves included: the cells of a row of like blocks. Runs share
 * a line when their middles, as the page is displayed, are within half the
 * shorter one's height, so a turned page's rows are its displayed rows. Each
 * run is compared only with those near its own line, so a page costs n log n
 * unless a great many runs share one line. A page that would cost more than
 * MAX_COMPARISONS returns every run, as if all were in a row.
 */
export function tableRowCells<R extends { bounds: PageRect }>(
  runs: readonly R[],
  display: DisplayTransformData | null,
  { keyOf, cells }: { keyOf: (run: R) => string; cells: number },
): Set<R> {
  const placed = placeAll(runs, display, keyOf);
  const budget = { left: MAX_COMPARISONS };
  const inRow = new Set<R>();
  for (const [i, item] of placed.entries()) {
    const alongside = lineMates(placed, i, budget).length;
    if (budget.left < 0) return new Set(runs);
    if (alongside + 1 >= cells) inRow.add(item.run);
  }
  return inRow;
}

/**
 * The runs of one page that are cells of a table: those on a displayed line
 * of two or more blocks that shares at least two columns with another such
 * line within a few lines of it, the columns matched left to right by blocks
 * that overlap across the page. Errs towards a table, so a running header
 * laid out in columns above columned text may count as one: callers use this
 * to keep content, and losing a table's text costs more than reading a header.
 * For the same reason a page that would cost more than MAX_COMPARISONS
 * returns every run.
 */
export function tableCells<R extends { bounds: PageRect }>(
  runs: readonly R[],
  display: DisplayTransformData | null,
): Set<R> {
  const budget = { left: MAX_COMPARISONS };
  const lines = displayedLines(
    placeAll(runs, display, () => ""),
    budget,
  );
  if (!lines) return new Set(runs);
  const rows = lines
    .filter((cells) => cells.length >= MIN_COLUMNS)
    .map(rowOf)
    .sort((a, b) => a.low - b.low);
  const inTable = new Set<R>();
  for (const [i, row] of rows.entries()) {
    const reach = ROW_REACH * 2 * row.lineHalf;
    for (let j = i + 1; j < rows.length; j++) {
      const next = rows[j];
      // Rows after this one start no lower, so their gap only grows.
      if (next.low - row.high > reach) break;
      budget.left -= 1 + row.cells.length + next.cells.length;
      if (budget.left < 0) return new Set(runs);
      const line = 2 * Math.min(row.lineHalf, next.lineHalf);
      if (gap(row, next) > ROW_REACH * line) continue;
      if (sharedColumns(row.cells, next.cells) < MIN_COLUMNS) continue;
      for (const cell of [...row.cells, ...next.cells]) inTable.add(cell.run);
    }
  }
  return inTable;
}

function placeAll<R extends { bounds: PageRect }>(
  runs: readonly R[],
  display: DisplayTransformData | null,
  keyOf: (run: R) => string,
): Placed<R>[] {
  return runs
    .map((run) => ({
      run,
      key: keyOf(run),
      ...displayedBox(run.bounds, display),
    }))
    .sort((a, b) => a.middle - b.middle);
}

/**
 * The indices of the runs in `placed`, sorted by middle, on a line with
 * `placed[i]`. Spends a comparison of `budget` for each run it looks at, and
 * stops early once that runs out.
 */
function lineMates<R>(
  placed: readonly Placed<R>[],
  i: number,
  budget: Budget,
): number[] {
  const item = placed[i];
  const mates: number[] = [];
  for (
    let j = i - 1;
    j >= 0 && item.middle - placed[j].middle <= item.half && budget.left-- > 0;
    j--
  ) {
    if (sameLine(item, placed[j])) mates.push(j);
  }
  for (
    let j = i + 1;
    j < placed.length &&
    placed[j].middle - item.middle <= item.half &&
    budget.left-- > 0;
    j++
  ) {
    if (sameLine(item, placed[j])) mates.push(j);
  }
  return mates;
}

/**
 * `placed` grouped into displayed lines: runs joined by sharing a line,
 * directly or through others. Null once `budget` runs out.
 */
function displayedLines<R>(
  placed: readonly Placed<R>[],
  budget: Budget,
): Placed<R>[][] | null {
  const parent = placed.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (const i of placed.keys()) {
    for (const j of lineMates(placed, i, budget)) parent[root(j)] = root(i);
    if (budget.left < 0) return null;
  }
  const lines = new Map<number, Placed<R>[]>();
  for (const [i, item] of placed.entries()) {
    const line = lines.get(root(i)) ?? [];
    lines.set(root(i), line);
    line.push(item);
  }
  return [...lines.values()];
}

// Folded rather than spread: Math.min(...cells) overflows the stack on a line
// of a few hundred thousand runs.
function rowOf<R>(cells: Placed<R>[]): Row<R> {
  let [low, high, lineHalf] = [Infinity, -Infinity, Infinity];
  for (const cell of cells) {
    low = Math.min(low, cell.low);
    high = Math.max(high, cell.high);
    lineHalf = Math.min(lineHalf, cell.half);
  }
  return { cells, low, high, middle: (low + high) / 2, lineHalf };
}

function gap<R>(a: Row<R>, b: Row<R>): number {
  return Math.max(0, Math.max(a.low, b.low) - Math.min(a.high, b.high));
}

/** How many of `a`'s blocks overlap a block of `b` across the page, each matched once, left to right. */
function sharedColumns<R>(
  a: readonly Placed<R>[],
  b: readonly Placed<R>[],
): number {
  const byLeft = (p: Placed<R>, q: Placed<R>) => p.left - q.left;
  const upper = [...a].sort(byLeft);
  const lower = [...b].sort(byLeft);
  let shared = 0;
  for (let i = 0, j = 0; i < upper.length && j < lower.length;) {
    if (
      Math.min(upper[i].right, lower[j].right) >
      Math.max(upper[i].left, lower[j].left)
    ) {
      shared++;
      i++;
      j++;
    } else if (upper[i].right <= lower[j].left) i++;
    else j++;
  }
  return shared;
}

function sameLine<R>(a: Placed<R>, b: Placed<R>): boolean {
  return (
    a.key === b.key && Math.abs(a.middle - b.middle) <= Math.min(a.half, b.half)
  );
}

function displayedBox(
  { x, y, width, height }: PageRect,
  display: DisplayTransformData | null,
): Omit<Placed<never>, "run" | "key"> {
  const corners = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ];
  const xs = display
    ? corners.map(([px, py]) => display.a * px + display.c * py + display.e)
    : corners.map(([px]) => px);
  const ys = display
    ? corners.map(([px, py]) => display.b * px + display.d * py + display.f)
    : corners.map(([, py]) => py);
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    low,
    high,
    middle: (low + high) / 2,
    half: (high - low) / 2,
  };
}
