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

/** The part of a run that holds viewer-selected text. */
export interface ViewerTextSpan {
  runId: string;
  range: TextRange;
}

/**
 * Every run that holds text selected in the viewer, in reading order, each
 * with the span of it that run holds. The viewer and the editor split a
 * page's text into different pieces, so whitespace is compared collapsed and
 * the match covers the whole selection, not just its first line. Where the
 * text repeats, the copy nearest the viewer's selection wins. A selection no
 * run holds in full falls back to the longest start of its first line that
 * one run contains, so something is still selected.
 */
export function locateViewerText(
  page: PageSnapshot,
  text: string,
  near?: ViewerRect,
): ViewerTextSpan[] | null {
  const target = normalize(text);
  if (!target.text) return null;

  const point = near ? pointInPdf(page, near) : null;
  const runs = page.runs
    .map((run) => ({ run, ...normalize(run.text) }))
    .filter((r) => r.text.length > 0);
  if (runs.length === 0) return null;

  const whole = wholeInOneRun(runs, target, point);
  if (whole) return [whole];
  const across = acrossRuns(runs, target.text, point);
  if (across) return across;
  return firstLinePrefix(runs, text, point);
}

type Run = PageSnapshot["runs"][number];
type Point = { x: number; y: number };

interface NormalizedRun {
  run: Run;
  /** The run's text with whitespace runs collapsed to one space and trimmed. */
  text: string;
  /** For each character of `text`, its offset in the run's own text. */
  offsets: number[];
}

interface Normalized {
  text: string;
  offsets: number[];
}

/**
 * Whitespace-insensitive view of `text`. The viewer separates lines with
 * newlines while the editor separates them with newlines or spaces, and
 * either side may carry runs of spaces, so comparison collapses every
 * whitespace run to a single space. Each output character keeps its offset in
 * the source so a match can be mapped back to a real edit range.
 */
function normalize(text: string): Normalized {
  let out = "";
  const offsets: number[] = [];
  let gap = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      gap = out.length > 0;
      continue;
    }
    if (gap) {
      out += " ";
      offsets.push(i);
      gap = false;
    }
    out += ch;
    offsets.push(i);
  }
  return { text: out, offsets };
}

function wholeInOneRun(
  runs: NormalizedRun[],
  target: Normalized,
  point: Point | null,
): ViewerTextSpan | null {
  let best: { span: ViewerTextSpan; distance: number } | null = null;
  for (const run of runs) {
    const at = nearestCopy(run, target.text, point);
    if (at < 0) continue;
    const distance = point ? distanceTo(run.run.bounds, point) : 0;
    if (!best || distance < best.distance) {
      best = { span: spanOf(run, at, target.text.length), distance };
    }
  }
  return best?.span ?? null;
}

/**
 * The runs covering a selection too large for any one of them. Runs are laid
 * out in reading order, so a contiguous stretch of that order is the only
 * place a multi-run selection can be found.
 */
function acrossRuns(
  runs: NormalizedRun[],
  target: string,
  point: Point | null,
): ViewerTextSpan[] | null {
  let combined = "";
  const starts: number[] = [];
  for (const run of runs) {
    if (combined.length > 0) combined += " ";
    starts.push(combined.length);
    combined += run.text;
  }

  let best: { spans: ViewerTextSpan[]; distance: number } | null = null;
  for (let at = combined.indexOf(target); at !== -1;) {
    const spans = spansOf(runs, starts, at, target.length);
    const distance = point ? spansDistance(spans, runs, point) : 0;
    if (!best || distance < best.distance) best = { spans, distance };
    at = combined.indexOf(target, at + 1);
  }
  return best?.spans ?? null;
}

/**
 * Falls back to the longest prefix of the selection's first line that a
 * single run holds, for selections the editor's own text cannot reproduce.
 */
function firstLinePrefix(
  runs: NormalizedRun[],
  text: string,
  point: Point | null,
): ViewerTextSpan[] | null {
  const line = normalize(
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "",
  ).text;
  if (!line) return null;

  let best: { run: NormalizedRun; length: number; distance: number } | null =
    null;
  for (const run of runs) {
    const length = longestPrefixIn(line, run.text);
    if (length === 0 || (best && length < best.length)) continue;
    const distance = point ? distanceTo(run.run.bounds, point) : 0;
    if (!best || length > best.length || distance < best.distance) {
      best = { run, length, distance };
    }
  }
  if (!best) return null;
  const start = Math.max(
    0,
    nearestCopy(best.run, line.slice(0, best.length), point),
  );
  return [spanOf(best.run, start, best.length)];
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

function spanOf(
  run: NormalizedRun,
  start: number,
  length: number,
): ViewerTextSpan {
  return {
    runId: run.run.id,
    range: {
      start: run.offsets[start],
      end: run.offsets[start + length - 1] + 1,
    },
  };
}

function spansOf(
  runs: NormalizedRun[],
  starts: number[],
  at: number,
  length: number,
): ViewerTextSpan[] {
  const end = at + length;
  const spans: ViewerTextSpan[] = [];
  for (let i = 0; i < runs.length; i++) {
    const from = Math.max(at, starts[i]);
    const to = Math.min(end, starts[i] + runs[i].text.length);
    if (from >= to) continue;
    spans.push(spanOf(runs[i], from - starts[i], to - from));
  }
  return spans;
}

/** How far the first and last run of a match sit from the viewer's selection. */
function spansDistance(
  spans: ViewerTextSpan[],
  runs: NormalizedRun[],
  point: Point,
): number {
  const byId = new Map(runs.map((r) => [r.run.id, r.run]));
  const ends = [spans[0], spans[spans.length - 1]];
  let distance = Infinity;
  for (const span of ends) {
    const run = byId.get(span.runId);
    if (run) distance = Math.min(distance, distanceTo(run.bounds, point));
  }
  return distance;
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
 * Offset of the copy of `part` nearest `point`, or -1 when the run lacks it.
 * A run keeps no per-character positions, so the point's place in the run is
 * estimated from its line, its lines taken as evenly spaced, and how far
 * along that line it sits.
 */
function nearestCopy(
  run: NormalizedRun,
  part: string,
  point: Point | null,
): number {
  const first = run.text.indexOf(part);
  if (first < 0) return -1;
  const b = run.run.bounds;
  if (!point || b.width <= 0 || b.height <= 0) return first;
  const lines = Math.max(1, run.run.paragraphLineCount ?? 1);
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
