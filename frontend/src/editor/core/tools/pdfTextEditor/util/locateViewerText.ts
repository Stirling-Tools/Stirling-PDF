import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type {
  PageSnapshot,
  TextRange,
} from "@editor/tools/pdfTextEditor/types";

/** A box on the page in PDF points, measured from the top-left corner. */
export interface ViewerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The run holding the start of text selected in the viewer, and the span of
 * it that run holds. The viewer and the editor split a page's text into
 * different pieces, so the match is the longest start of the selection's
 * first line that one run contains. Where several runs hold it equally, the
 * one nearest the viewer's selection wins, and where a run holds it more than
 * once, the copy nearest the selection's place in the run's reading order.
 */
export function locateViewerText(
  page: PageSnapshot,
  text: string,
  near?: ViewerRect,
): { runId: string; range: TextRange } | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;

  const point = near ? pointInPdf(page, near) : null;
  let best: { run: Run; length: number; distance: number } | null = null;
  for (const run of page.runs) {
    const length = longestPrefixIn(line, run.text);
    if (length === 0 || (best && length < best.length)) continue;
    const distance = point ? distanceTo(run.bounds, point) : 0;
    if (!best || length > best.length || distance < best.distance) {
      best = { run, length, distance };
    }
  }
  if (!best) return null;
  const { run, length } = best;
  const start = nearestCopy(run, line.slice(0, length), point);
  return { runId: run.id, range: { start, end: start + length } };
}

type Run = PageSnapshot["runs"][number];
type Point = { x: number; y: number };

function longestPrefixIn(line: string, text: string): number {
  let lo = 0;
  let hi = Math.min(line.length, text.length);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (text.includes(line.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The centre of the viewer's selection in PDF space. Only an unrotated page
 * shares the viewer's axes; on any other there is no point, which leaves the
 * first match.
 */
function pointInPdf(page: PageSnapshot, near: ViewerRect): Point | null {
  if (page.display.rotate !== 0) return null;
  return DisplayTransform.fromData(page.display).invert(
    near.x + near.width / 2,
    page.display.displayHeight - (near.y + near.height / 2),
  );
}

function distanceTo(b: Run["bounds"], p: Point): number {
  return Math.hypot(b.x + b.width / 2 - p.x, b.y + b.height / 2 - p.y);
}

/**
 * Offset of the copy of `part` nearest `point`. A run keeps no per-character
 * positions, so the point's place in the run is estimated from its line, its
 * lines taken as evenly spaced, and how far along that line it sits.
 */
function nearestCopy(run: Run, part: string, point: Point | null): number {
  const first = run.text.indexOf(part);
  const b = run.bounds;
  if (!point || b.width <= 0 || b.height <= 0) return first;
  const lines = Math.max(1, run.paragraphLineCount ?? 1);
  const down = clamp01((b.y + b.height - point.y) / b.height);
  const across = clamp01((point.x - b.x) / b.width);
  const along =
    (Math.min(lines - 1, Math.floor(down * lines)) + across) / lines;
  let best = first;
  let bestGap = Infinity;
  for (let i = first; i !== -1; i = run.text.indexOf(part, i + 1)) {
    const gap = Math.abs((i + part.length / 2) / run.text.length - along);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
