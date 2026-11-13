import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  FIT_PAUSED,
  withFitDeadline,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";

export const FIT_SLICE_MS = 12;
export const FIT_GAP_MS = 4;

export interface ScanFitTarget {
  page: Page;
  run: TextRun;
}

export function scanRunsToFit(
  doc: EditorDocument,
  targets: ScanFitTarget[],
): ScanFitTarget[] {
  return targets.filter((t) => scanRunNeedsFit(doc, t.run));
}

const nextSlice = () =>
  new Promise<void>((resolve) => setTimeout(resolve, FIT_GAP_MS));

/** Fits each target between timer slices; returns early once `doc` is disposed, leaving the rest unfitted. */
export async function prefitInSlices(
  doc: EditorDocument,
  targets: ScanFitTarget[],
): Promise<void> {
  for (const { page, run } of targets) {
    try {
      while (true) {
        if (doc.disposed) return;
        if (prefitScanRun(doc, page, run, performance.now() + FIT_SLICE_MS))
          break;
        await nextSlice();
      }
    } catch (err) {
      console.warn("[pdf-editor] scanned text could not be fitted", err);
      continue;
    }
    await nextSlice();
  }
}

export function inSlice<T>(fit: () => T): T | typeof FIT_PAUSED {
  try {
    return withFitDeadline(performance.now() + FIT_SLICE_MS, fit);
  } catch (e) {
    if (e === FIT_PAUSED) return FIT_PAUSED;
    throw e;
  }
}
