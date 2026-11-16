import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import { rotationFromMatrix } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

// Lines set tighter than their own boxes already overlap the line above a little; that much is the document's layout, not a collision.
const TOUCH_TOLERANCE_EM = 0.25;
const SLACK_PT = 0.5;
const BOX_ESTIMATE_EM = 0.5;

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
 * by the same amount. Only runs under the edited text's own width are
 * considered, so a wide line in the chain cannot drag a neighbouring column
 * with it. Empty when nothing would be covered, and also when any
 * run in that chain cannot move or would leave the page: moving only part of
 * a chain swaps one overlap for another.
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
  let limit = edited.bounds.y;
  const below = page.runs
    .filter((r) => r !== edited && top(r) <= oldBottom + tolerance)
    .sort((a, b) => top(b) - top(a));
  const pushed: string[] = [];
  for (const run of below) {
    if (!overlapsSpan(run, left, right)) continue;
    const alreadyOverlapping = Math.max(0, top(run) - oldBottom);
    if (top(run) <= limit + alreadyOverlapping + SLACK_PT) break;
    if (!canMove(page, run) || run.bounds.y - drop < page.display.cropBottom)
      return none;
    pushed.push(run.id);
    limit = Math.min(limit, run.bounds.y - drop);
  }
  if (landsOnStillText(page, edited, pushed, drop)) return none;
  return { runIds: pushed, dy: -drop };
}

function boxesMeet(a: PageRect, b: PageRect): boolean {
  return (
    a.x < b.x + b.width - SLACK_PT &&
    a.x + a.width > b.x + SLACK_PT &&
    a.y < b.y + b.height - SLACK_PT &&
    a.y + a.height > b.y + SLACK_PT
  );
}

// A moved line wider than the edited text can reach text in the next column, which stays put.
function landsOnStillText(
  page: Page,
  edited: TextRun,
  pushed: string[],
  drop: number,
): boolean {
  const moving = new Set(pushed);
  const still = page.runs.filter((r) => r !== edited && !moving.has(r.id));
  return page.runs
    .filter((r) => moving.has(r.id))
    .some((run) => {
      const lands = { ...run.bounds, y: run.bounds.y - drop };
      return still.some(
        (other) =>
          boxesMeet(lands, other.bounds) &&
          !boxesMeet(run.bounds, other.bounds),
      );
    });
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
