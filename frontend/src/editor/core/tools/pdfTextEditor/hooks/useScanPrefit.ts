import { useEffect, useMemo } from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  isScanRun,
  prefitScanRun,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  loadBundledScanFaces,
  loadScriptScanFaces,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const SLICE_MS = 12;
const GAP_MS = 4;

export function useScanPrefit(
  store: EditorStore,
  state: EditorViewState,
): void {
  const scannedText = useMemo(
    () =>
      state.pages
        .flatMap((page) => page.runs)
        .filter((run) => run.renderMode === 3)
        .map((run) => run.text)
        .join(" "),
    [state.pages],
  );
  const hasScannedText = scannedText.length > 0;
  useEffect(() => {
    if (!hasScannedText) return;
    let stopped = false;
    let timer = 0;
    const done = new WeakSet<object>();
    const step = () => {
      const doc = store.document;
      if (stopped || !doc) return;
      for (const snapshot of state.pages) {
        const page = doc.page(snapshot.pageIndex);
        const run = page.runs.find((r) => isScanRun(r) && !done.has(r));
        if (!run) continue;
        try {
          if (prefitScanRun(doc, page, run, performance.now() + SLICE_MS))
            done.add(run);
        } catch {
          done.add(run);
        }
        timer = window.setTimeout(step, GAP_MS);
        return;
      }
    };
    void Promise.all([
      loadBundledScanFaces(),
      loadScriptScanFaces(scannedText),
    ]).then(() => {
      if (!stopped) timer = window.setTimeout(step, GAP_MS);
    });
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [store, hasScannedText, scannedText, state.pages]);
}
