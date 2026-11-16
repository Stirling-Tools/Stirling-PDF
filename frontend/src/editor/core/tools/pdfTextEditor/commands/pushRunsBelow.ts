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

interface Pushed {
  byRun: Map<string, number>;
  lines: number;
}

// How far each edited run has pushed the runs below it, and over how many added lines, net of undo: only that much is pulled back when its lines go.
const pushedBelow = new WeakMap<TextRun, Pushed>();

function pushedBy(edited: TextRun): Pushed {
  let pushed = pushedBelow.get(edited);
  if (!pushed)
    pushedBelow.set(edited, (pushed = { byRun: new Map(), lines: 0 }));
  return pushed;
}

export function notePush(edited: TextRun, runId: string, dy: number): void {
  const { byRun } = pushedBy(edited);
  const total = (byRun.get(runId) ?? 0) + dy;
  if (Math.abs(total) < 0.01) byRun.delete(runId);
  else byRun.set(runId, total);
}

/** Records `lines` more (or, negative, fewer) of the edited run's lines as holding the runs below down. */
export function notePushedLines(edited: TextRun, lines: number): void {
  const pushed = pushedBy(edited);
  pushed.lines = Math.max(0, pushed.lines + lines);
}

/** How many of the edited run's added lines are holding the runs below down. */
export function pushedLines(edited: TextRun): number {
  return pushedBelow.get(edited)?.lines ?? 0;
}

/**
 * The runs `edited` pushed down that losing `linesRemoved` of its added lines
 * lets back up. Each rises by that share of how far it was pushed, so the last
 * added line to go returns it to exactly where the document put it, whatever
 * the line height has become since. A run that can no longer move, such as
 * one locked since, stays where it is.
 */
export function runsPulledBack(
  page: Page,
  edited: TextRun,
  linesRemoved: number,
): Array<{ runId: string; dy: number }> {
  const pushed = pushedBelow.get(edited);
  if (!pushed || linesRemoved <= 0) return [];
  const share = pushed.lines > 0 ? Math.min(1, linesRemoved / pushed.lines) : 1;
  return [...pushed.byRun]
    .filter(([runId, total]) => {
      const run = page.findRun(runId);
      return total < 0 && run !== undefined && canMove(page, run);
    })
    .map(([runId, total]) => ({ runId, dy: -total * share }));
}
