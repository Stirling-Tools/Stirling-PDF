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

// `pushed` plus every run outside the edited width that one of them comes down on, and so on down; null when one of those cannot move.
function withRunsLandedOn(
  page: Page,
  edited: TextRun,
  pushed: string[],
  drop: number,
): string[] | null {
  const moving = new Set(pushed);
  const chain = page.runs.filter((r) => moving.has(r.id));
  for (let i = 0; i < chain.length; i++) {
    const run = chain[i];
    // Everything the run passes over on its way down, not only where it stops: a drop of several lines can clear a line entirely.
    const swept = {
      ...run.bounds,
      y: run.bounds.y - drop,
      height: run.bounds.height + drop,
    };
    for (const other of page.runs) {
      if (other.id === edited.id || moving.has(other.id)) continue;
      // Lines set tighter than their boxes already share a little height; only more than that is a collision.
      const before = overlapDepth(run.bounds, other.bounds);
      // A run mostly inside the moving one's box sits among its lines, such as a word the document drew separately, and goes with them.
      const among = before > other.bounds.height * AMONG_LINES_SHARE;
      if (!among && overlapDepth(swept, other.bounds) <= before + SLACK_PT)
        continue;
      if (
        !canMove(page, other) ||
        other.bounds.y - drop < page.display.cropBottom
      )
        return null;
      moving.add(other.id);
      chain.push(other);
    }
  }
  return [
    ...pushed,
    ...chain.map((r) => r.id).filter((id) => !pushed.includes(id)),
  ];
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
