import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import {
  RewrapTextCommand,
  rewrapDrawnLines,
} from "@editor/tools/pdfTextEditor/commands/rewrapDrawnLines";
import { rotationFromMatrix } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  isScanRun,
  wrapScanText,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

/** Whether the user may set `run`'s width: never read-only text, and a scanned block only while upright, since its rewrap lays lines out along the page's axes. */
export function canResizeRun(
  run: Pick<TextRunSnapshot, "renderMode" | "textReadOnly" | "matrix">,
): boolean {
  if (run.textReadOnly) return false;
  if (!isScanRun(run)) return true;
  const turn = rotationFromMatrix(run.matrix);
  return !turn || (Math.abs(turn.sin) < 1e-6 && turn.cos > 0);
}

/**
 * The command that sets a run's width to `widthPt`, as its own undo step, or
 * null when there is nothing to do. A scanned block is rewrapped by rewriting
 * its text, since its words are pixels that only the scan redraw can move.
 */
export function resizeRunCommand(
  doc: EditorDocument,
  pageIndex: number,
  runId: string,
  widthPt: number,
): Command | null {
  const page = doc.page(pageIndex);
  const run = page.findRun(runId);
  if (!run || !canResizeRun(run)) return null;
  const maxWidthPt = Math.max(1, widthPt);
  if (isScanRun(run)) {
    const wrapped = wrapScanText(doc, page, run, maxWidthPt);
    if (wrapped === null || wrapped === run.text) return null;
    return new EditTextCommand({
      pageIndex,
      runId,
      nextText: wrapped,
      explicit: true,
    });
  }
  const rewrapped = rewrapDrawnLines(doc, page, run, maxWidthPt);
  if (rewrapped !== null)
    return rewrapped === run.text
      ? null
      : new RewrapTextCommand(pageIndex, runId, rewrapped, maxWidthPt);
  return new ReflowWrapCommand({
    pageIndex,
    runId,
    maxWidthPt,
    explicit: true,
  });
}
