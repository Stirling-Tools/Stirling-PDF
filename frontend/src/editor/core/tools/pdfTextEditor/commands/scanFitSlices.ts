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

export async function prefitInSlices(
  doc: EditorDocument,
  targets: ScanFitTarget[],
): Promise<void> {
  for (const { page, run } of targets) {
    try {
      while (!prefitScanRun(doc, page, run, performance.now() + FIT_SLICE_MS))
        await nextSlice();
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

const visible = () =>
  new Promise<void>((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });

/** Runs `fit` slice by slice as {@link prefitInSlices} does, idle while the tab is hidden; null once `live` turns false. */
export async function fitInSlices<T>(
  fit: () => T,
  live: () => boolean,
): Promise<T | null> {
  for (;;) {
    await nextSlice();
    if (document.hidden) await visible();
    if (!live()) return null;
    const result = inSlice(fit);
    if (result !== FIT_PAUSED) return result;
    await nextSlice();
  }
}
