import type { DisplayTransformData } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** How many blocks side by side on one line make a table row rather than a running header. */
const TABLE_ROW = 4;
/** How far, in line heights, the next row of a table sits from a row of it. */
const ROW_REACH = 3;

interface Placed<R> {
  run: R;
  key: string;
  /** The run's vertical middle and half height as the page is displayed. */
  middle: number;
  half: number;
}

/**
 * The runs of one page that sit on a line with `cells` runs of the same
 * `keyOf`, themselves included: the cells of a table row. Runs share a line
 * when their middles, as the page is displayed, are within half the shorter
 * one's height, so a turned page's rows are its displayed rows. With
 * `stacked`, a row also needs another within a few lines of it, so a lone
 * line of parts, such as a running footer, is not a table. Each run is
 * compared only with those near its own line, so a page costs n log n unless
 * a great many runs share one line.
 */
export function tableRowCells<R extends { bounds: PageRect }>(
  runs: readonly R[],
  display: DisplayTransformData | null,
  {
    keyOf = () => "",
    cells = TABLE_ROW,
    stacked = false,
  }: { keyOf?: (run: R) => string; cells?: number; stacked?: boolean } = {},
): Set<R> {
  const placed: Placed<R>[] = runs
    .map((run) => ({
      run,
      key: keyOf(run),
      ...displayedLine(run.bounds, display),
    }))
    .sort((a, b) => a.middle - b.middle);
  const inRow = new Set<R>();
  for (const [i, item] of placed.entries()) {
    let alongside = 0;
    for (
      let j = i - 1;
      j >= 0 && item.middle - placed[j].middle <= item.half;
      j--
    ) {
      if (sameLine(item, placed[j])) alongside++;
    }
    for (
      let j = i + 1;
      j < placed.length && placed[j].middle - item.middle <= item.half;
      j++
    ) {
      if (sameLine(item, placed[j])) alongside++;
    }
    if (alongside + 1 >= cells) inRow.add(item.run);
  }
  return stacked ? withRowNearby(placed, inRow) : inRow;
}

/** The cells in `inRow` with a cell of another row within ROW_REACH lines. */
function withRowNearby<R>(placed: readonly Placed<R>[], inRow: Set<R>): Set<R> {
  const rows = placed.filter((item) => inRow.has(item.run));
  const kept = new Set<R>();
  for (const [i, item] of rows.entries()) {
    const reach = item.half * 2 * ROW_REACH;
    const otherRow = (other: Placed<R>) =>
      Math.abs(other.middle - item.middle) > Math.min(item.half, other.half);
    let near = false;
    for (let j = i - 1; !near && j >= 0; j--) {
      if (item.middle - rows[j].middle > reach) break;
      near = otherRow(rows[j]);
    }
    for (let j = i + 1; !near && j < rows.length; j++) {
      if (rows[j].middle - item.middle > reach) break;
      near = otherRow(rows[j]);
    }
    if (near) kept.add(item.run);
  }
  return kept;
}

function sameLine<R>(a: Placed<R>, b: Placed<R>): boolean {
  return (
    a.key === b.key && Math.abs(a.middle - b.middle) <= Math.min(a.half, b.half)
  );
}

function displayedLine(
  { x, y, width, height }: PageRect,
  display: DisplayTransformData | null,
): { middle: number; half: number } {
  if (!display) return { middle: y + height / 2, half: height / 2 };
  const ys = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ].map(([px, py]) => display.b * px + display.d * py + display.f);
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  return { middle: (low + high) / 2, half: (high - low) / 2 };
}
