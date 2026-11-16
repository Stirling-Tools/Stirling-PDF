import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import { rotationFromMatrix } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

// Lines set tighter than their own boxes already overlap the line above a little; that much is the document's layout, not a collision.
const TOUCH_TOLERANCE_EM = 0.25;
const SLACK_PT = 0.5;
const BOX_ESTIMATE_EM = 0.5;
// The room a line keeps under it, where the document gave it at least that: lines that only just clear each other read as touching.
const CLEARANCE_EM = 0.1;
const AMONG_LINES_SHARE = 0.5;

const top = (run: TextRun) => run.bounds.y + run.bounds.height;

function overlapsSpan(run: TextRun, left: number, right: number): boolean {
  return run.bounds.x < right && run.bounds.x + run.bounds.width > left;
}

function inTable(page: Page, runId: string): boolean {
  return page.tables.some(
    (table) =>
      table.cellRuns.some((row) => row.includes(runId)) ||
      table.cellExtraRuns.some((row) =>
        row.some((extra) => extra?.includes(runId)),
      ),
  );
}

function canMove(page: Page, run: TextRun): boolean {
  return (
    !run.locked &&
    !rotationFromMatrix(run.matrix) &&
    !isScanRun(run) &&
    !inTable(page, run.id)
  );
}

/**
 * The runs below `edited` that its growth from `oldBottom` down to its current
 * bottom lands on, together with every run those then land on, all to move down
 * by the same amount. A run counts as landed on once less than a tenth of an em
 * is left above it, unless the document set it closer than that to begin
 * with. Directly under the edited text only runs sharing its
 * width are taken, so the column beside it stays put; a moved line wider than
 * that takes whatever it would itself come down on, such as a right-aligned
 * line or the text under a heading that spans two columns. Empty when nothing
 * would be covered, and also when any run in that chain cannot move or would
 * leave the page: moving only part of a chain swaps one overlap for another.
 *
 * `addedHeight` is the height of the lines the edit added. The runs move by
 * that, so the distance from the last line to the text below stays what the
 * document had, unless the box grew by something else altogether.
 */
export function runsPushedBelow(
  page: Page,
  edited: TextRun,
  oldBottom: number,
  addedHeight = 0,
): { runIds: string[]; dy: number } {
  const grown = oldBottom - edited.bounds.y;
  const none = { runIds: [], dy: 0 };
  if (grown <= 0.5 || !canMove(page, edited) || inTable(page, edited.id))
    return none;
  // The box of an edited run is an estimate where the document's was measured, so the first edit shifts its bottom by a little more or less than the lines it added.
  const drop =
    Math.abs(grown - addedHeight) <= edited.fontSize * BOX_ESTIMATE_EM
      ? addedHeight
      : grown;
  const tolerance = edited.fontSize * TOUCH_TOLERANCE_EM;
  const left = edited.bounds.x;
  const right = edited.bounds.x + edited.bounds.width;
  const clearance = edited.fontSize * CLEARANCE_EM;
  // The lowest bottom of what has moved so far, and where that bottom was before it moved.
  let limit = edited.bounds.y;
  let limitBefore = oldBottom;
  const below = page.runs
    .filter((r) => r !== edited && top(r) <= oldBottom + tolerance)
    .sort((a, b) => top(b) - top(a));
  const pushed: string[] = [];
  for (const run of below) {
    if (!overlapsSpan(run, left, right)) continue;
    // Negative where the two already overlapped: that much is the document's layout, and stays.
    const gapBefore = limitBefore - top(run);
    if (top(run) <= limit - Math.min(clearance, gapBefore) + SLACK_PT) break;
    if (!canMove(page, run) || run.bounds.y - drop < page.display.cropBottom)
      return none;
    pushed.push(run.id);
    if (run.bounds.y - drop < limit) {
      limit = run.bounds.y - drop;
      limitBefore = run.bounds.y;
    }
  }
  const runIds = withRunsLandedOn(page, edited, pushed, drop);
  return runIds ? { runIds, dy: -drop } : none;
}

// How much of their height two boxes share, where they share any width.
function overlapDepth(a: PageRect, b: PageRect): number {
  if (a.x >= b.x + b.width - SLACK_PT || a.x + a.width <= b.x + SLACK_PT)
    return 0;
  return Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
}

function canMoveDown(page: Page, run: TextRun, drop: number): boolean {
  return canMove(page, run) && !(run.bounds.y - drop < page.display.cropBottom);
}

// The overlay's line metrics, for fonts the page has not measured: CSS ascent and descent, and the line height it falls back to. Must stay in step with the flow box in TextRunOverlay.
const BOX_ASCENT_EM = 0.95;
const BOX_DESCENT_EM = 0.25;
const BOX_LINE_HEIGHT_EM = 1.2;

// Where the overlay draws `run`'s box: a line height per line from above the first baseline, a descender deeper than the last, and never less than its ink.
function overlayBox(run: TextRun): PageRect {
  const size = run.fontSize > 0 ? run.fontSize : 12;
  const lineHeight =
    run.paragraphLineHeight > 0
      ? run.paragraphLineHeight
      : size * BOX_LINE_HEIGHT_EM;
  const metrics = (BOX_ASCENT_EM + BOX_DESCENT_EM) * size;
  const boxTop =
    run.matrix.f +
    Math.max(0, (lineHeight - metrics) / 2) +
    BOX_ASCENT_EM * size;
  const boxBottom =
    boxTop -
    run.text.split(/\r?\n/).length * lineHeight -
    BOX_DESCENT_EM * size;
  const y = Math.min(run.bounds.y, boxBottom);
  return {
    x: run.bounds.x,
    y,
    width: run.bounds.width,
    height: Math.max(top(run), boxTop) - y,
  };
}

const lowered = (rect: PageRect, drop: number): PageRect => ({
  ...rect,
  y: rect.y - drop,
  height: rect.height + drop,
});

// `pushed` plus every run outside the edited width that one of them comes down on, and so on down; null when one of those cannot move. A run only the moved run's overlay box comes down on, not its ink, is taken where it can move and left where it cannot.
function withRunsLandedOn(
  page: Page,
  edited: TextRun,
  pushed: string[],
  drop: number,
): string[] | null {
  const moving = new Set(pushed);
  const chain = page.runs.filter((r) => moving.has(r.id));
  const unmoved = new UnmovedRuns(
    page.runs.filter((r) => r.id !== edited.id && !moving.has(r.id)),
  );
  for (let i = 0; i < chain.length; i++) {
    const run = chain[i];
    // Everything the run passes over on its way down, not only where it stops: a drop of several lines can clear a line entirely.
    const swept = lowered(run.bounds, drop);
    const box = overlayBox(run);
    const sweptBox = lowered(box, drop);
    const landed: number[] = [];
    unmoved.within(box, sweptBox, (other, order) => {
      if (moving.has(other.id)) return true;
      // Lines set tighter than their boxes already share a little height; only more than that is a collision.
      const before = overlapDepth(run.bounds, other.bounds);
      // A run mostly inside the moving one's box sits among its lines, such as a word the document drew separately, and goes with them.
      const among = before > other.bounds.height * AMONG_LINES_SHARE;
      // Written as "not clear" so a box with no measurable height counts as landed on.
      const inkHit =
        among || !(overlapDepth(swept, other.bounds) <= before + SLACK_PT);
      if (!inkHit) {
        const otherBox = unmoved.boxes[order];
        const boxHit = !(
          overlapDepth(sweptBox, otherBox) <=
          overlapDepth(box, otherBox) + SLACK_PT
        );
        if (!boxHit || !canMoveDown(page, other, drop)) return false;
      }
      landed.push(order);
      return true;
    });
    for (const order of landed.sort((a, b) => a - b)) {
      const other = unmoved.runs[order];
      if (moving.has(other.id)) continue;
      if (!canMoveDown(page, other, drop)) return null;
      moving.add(other.id);
      chain.push(other);
    }
  }
  const seeds = new Set(pushed);
  return [...pushed, ...chain.map((r) => r.id).filter((id) => !seeds.has(id))];
}

// Slack on the band query: the exact test runs on every candidate, so a wider band only costs a few extra comparisons.
const BAND_MARGIN_PT = 1;

/**
 * The runs not yet moving, in page order, indexed by height so a moving run
 * only meets the runs level with what it sweeps. Every collision needs the
 * two boxes to share some height, so nothing outside that band can be landed
 * on. A run whose box cannot be ordered (a negative, infinite or missing
 * height) is offered to every query instead.
 */
class UnmovedRuns {
  readonly runs: readonly TextRun[];
  /** Each run's overlay box, by its index in `runs`. */
  readonly boxes: readonly PageRect[];
  private readonly byBottom: number[];
  private readonly next: Int32Array;
  private readonly unordered: number[] = [];
  private readonly tallest: number;

  constructor(runs: readonly TextRun[]) {
    this.runs = runs;
    this.boxes = runs.map(overlayBox);
    const ordered: number[] = [];
    let tallest = 0;
    const orderable = ({ y, height }: PageRect) =>
      Number.isFinite(y) && Number.isFinite(height) && height >= 0;
    runs.forEach((run, order) => {
      const box = this.boxes[order];
      if (orderable(run.bounds) && orderable(box)) {
        ordered.push(order);
        tallest = Math.max(tallest, box.height);
      } else this.unordered.push(order);
    });
    this.byBottom = ordered.sort(
      (a, b) => this.boxes[a].y - this.boxes[b].y || a - b,
    );
    this.tallest = tallest;
    this.next = Int32Array.from(
      { length: this.byBottom.length + 1 },
      (_, i) => i,
    );
  }

  /**
   * Offers `visit` each run whose box can share height with `a` or `b`, by
   * its index in `runs`. A run `visit` answers true for is not offered again.
   */
  within(
    a: PageRect,
    b: PageRect,
    visit: (run: TextRun, order: number) => boolean,
  ): void {
    for (const order of this.unordered) visit(this.runs[order], order);
    const edges = [a.y, a.y + a.height, b.y, b.y + b.height];
    const low = Math.min(...edges) - this.tallest - BAND_MARGIN_PT;
    const high = Math.max(...edges) + BAND_MARGIN_PT;
    if (!(low <= high)) {
      this.byBottom.forEach((order) => visit(this.runs[order], order));
      return;
    }
    let lo = 0;
    let hi = this.byBottom.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.boxes[this.byBottom[mid]].y < low) lo = mid + 1;
      else hi = mid;
    }
    for (let i = this.live(lo); i < this.byBottom.length;) {
      const order = this.byBottom[i];
      if (this.boxes[order].y > high) break;
      if (visit(this.runs[order], order)) this.next[i] = i + 1;
      i = this.live(i + 1);
    }
  }

  // The first slot at or after `i` still offered, skipping taken ones in amortised constant time.
  private live(i: number): number {
    let root = i;
    while (this.next[root] !== root) root = this.next[root];
    while (this.next[i] !== root) {
      const after = this.next[i];
      this.next[i] = root;
      i = after;
    }
    return root;
  }
}

/** One push: the runs an edit moved, how far, and the lines of the edited run it made room for. */
export interface PushRecord {
  /** How many lines the edited run had once this push was made. */
  lineCount: number;
  linesAdded: number;
  runIds: readonly string[];
  /** Negative: down the page. */
  dy: number;
}

// The pushes each edited run still holds the runs below down with, oldest first, net of undo.
const pushedBelow = new WeakMap<TextRun, readonly PushRecord[]>();

export function pushRecords(edited: TextRun): readonly PushRecord[] {
  return pushedBelow.get(edited) ?? [];
}

/** Replaces what `edited` is recorded as holding down; undo and redo put back the list they found. */
export function setPushRecords(
  edited: TextRun,
  records: readonly PushRecord[],
): void {
  pushedBelow.set(edited, records);
}

/**
 * What to let back up now `edited` is down to `lineCount` lines: every push
 * made for a line it no longer has is taken back, the latest first, so the
 * runs below end up exactly where that many lines put them the first time,
 * whatever the line height has become since. A push made for several lines is
 * taken back by the share of them that went. `records` is what is still held
 * down afterwards.
 *
 * A run that can no longer move, such as one locked since, stays where it is
 * and is no longer held to this run.
 */
export function runsPulledBack(
  page: Page,
  edited: TextRun,
  lineCount: number,
): { moves: Array<{ runId: string; dy: number }>; records: PushRecord[] } {
  const records = [...pushRecords(edited)];
  const rise = new Map<string, number>();
  for (let last = records.at(-1); last; last = records.at(-1)) {
    const gone = Math.min(last.linesAdded, last.lineCount - lineCount);
    if (gone <= 0) break;
    const share = gone / last.linesAdded;
    for (const runId of last.runIds)
      rise.set(runId, (rise.get(runId) ?? 0) - last.dy * share);
    records.pop();
    if (gone < last.linesAdded)
      records.push({
        ...last,
        lineCount: last.lineCount - gone,
        linesAdded: last.linesAdded - gone,
        dy: last.dy * (1 - share),
      });
  }
  const moves = [...rise]
    .filter(([runId]) => {
      const run = page.findRun(runId);
      return run !== undefined && canMove(page, run);
    })
    .map(([runId, dy]) => ({ runId, dy }));
  return { moves, records };
}
