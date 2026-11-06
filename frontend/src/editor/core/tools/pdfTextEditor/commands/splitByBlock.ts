import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

/**
 * Replace `run` with a run for each structure block its text belongs to,
 * grouped as a page read groups it. A text edit redraws a run under one tag,
 * so a block left inside another's run loses its text on the next edit.
 */
export function splitByBlock(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  undo: Array<() => void>,
): TextRun[] {
  const m = doc.module;
  const ptrs = collectMemberPtrs(run);
  const onPage = new Set(
    Array.from({ length: m.FPDFPage_CountObjects(page.pagePtr) }, (_, i) =>
      m.FPDFPage_GetObject(page.pagePtr, i),
    ),
  );
  if (ptrs.some((ptr) => !onPage.has(ptr))) {
    throw new Error("Only text drawn on the page itself can be split");
  }
  // Only auto mode groups lines into one run.
  const mode = run.paragraphLineSlots.length > 1 ? "auto" : "line";
  const parts = PdfiumTextReader.readRuns(
    doc,
    page,
    ptrs.map((ptr, i) => ({ ptr, id: `${run.id}-part${i}` })),
    mode,
  );
  if (parts.length <= 1) return [run];
  const runs = page.runs;
  const at = runs.indexOf(run);
  page.setRuns([...runs.slice(0, at), ...parts, ...runs.slice(at + 1)]);
  undo.push(() => page.setRuns(runs));
  return parts;
}
