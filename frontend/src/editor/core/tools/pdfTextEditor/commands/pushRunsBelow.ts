import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { rotationFromMatrix } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

// Lines set tighter than their own boxes already overlap the line above a little; that much is the document's layout, not a collision.
const TOUCH_TOLERANCE_EM = 0.25;
const SLACK_PT = 0.5;

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
    run.containerPtr === 0 &&
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
 */
export function runsPushedBelow(
  page: Page,
  edited: TextRun,
  oldBottom: number,
): { runIds: string[]; dy: number } {
  const drop = oldBottom - edited.bounds.y;
  const none = { runIds: [], dy: 0 };
  if (drop <= 0.5 || !canMove(page, edited) || inTable(page, edited.id))
    return none;
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
  return { runIds: pushed, dy: -drop };
}
