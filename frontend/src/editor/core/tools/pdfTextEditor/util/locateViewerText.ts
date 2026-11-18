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
 * one nearest the viewer's selection wins.
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

  let best: { runId: string; range: TextRange; distance: number } | null = null;
  let bestLength = 0;
  const distanceTo = near ? nearness(page, near) : () => 0;
  for (const run of page.runs) {
    const length = longestPrefixIn(line, run.text);
    if (length === 0 || length < bestLength) continue;
    const start = run.text.indexOf(line.slice(0, length));
    const distance = distanceTo(run.bounds);
    if (length > bestLength || distance < best!.distance) {
      best = {
        runId: run.id,
        range: { start, end: start + length },
        distance,
      };
      bestLength = length;
    }
  }
  return best && { runId: best.runId, range: best.range };
}

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
 * Distance from a run to the viewer's selection. Only an unrotated page
 * shares the viewer's axes; on any other every run is equally near, which
 * leaves the first match.
 */
function nearness(
  page: PageSnapshot,
  near: ViewerRect,
): (bounds: PageSnapshot["runs"][number]["bounds"]) => number {
  if (page.display.rotate !== 0) return () => 0;
  const transform = DisplayTransform.fromData(page.display);
  const cx = near.x + near.width / 2;
  const cy = near.y + near.height / 2;
  return (b) => {
    const centre = transform.apply(b.x + b.width / 2, b.y + b.height / 2);
    return Math.hypot(
      centre.x - cx,
      page.display.displayHeight - centre.y - cy,
    );
  };
}
