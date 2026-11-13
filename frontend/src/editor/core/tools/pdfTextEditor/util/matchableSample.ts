import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  captureScanEdit,
  isScanRun,
  type ScanEditState,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

const MIN_MATCHABLE_LETTERS = 6; // shorter runs rank faces by too few glyphs to trust
const MAX_RUNS_CAPTURED = 4; // a shorter run rarely captures where the longest few failed

export interface MatchableSample {
  page: Page;
  captured: ScanEditState;
  text: string;
}

/** The longest upright run in `fontId`, captured for ranking; turned text is skipped because measuring it turns the whole page upright and back. */
export function matchableSample(
  doc: EditorDocument,
  fontId: string,
): MatchableSample | null {
  const runs: Array<{ page: Page; run: TextRun; letters: number }> = [];
  for (const page of doc.loadedPages())
    for (const run of page.runs) {
      if (run.fontId !== fontId || isScanRun(run)) continue;
      const letters = run.text.replace(/\s/g, "").length;
      if (letters >= MIN_MATCHABLE_LETTERS) runs.push({ page, run, letters });
    }
  runs.sort((a, b) => b.letters - a.letters);
  for (const { page, run } of runs.slice(0, MAX_RUNS_CAPTURED)) {
    const captured = captureScanEdit(doc.module, run, page);
    if (captured && !captured.frame) return { page, captured, text: run.text };
  }
  return null;
}
