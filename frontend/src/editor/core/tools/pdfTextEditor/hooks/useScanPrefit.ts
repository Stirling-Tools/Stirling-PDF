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
    let hovered: string | null = null;
    const onPointerOver = (e: PointerEvent) => {
      const el =
        e.target instanceof Element ? e.target.closest("[data-run-id]") : null;
      hovered = el?.getAttribute("data-run-id") ?? hovered;
    };
    document.addEventListener("pointerover", onPointerOver);
    const step = () => {
      const doc = store.document;
      if (stopped || !doc) return;
      const selected = hovered
        ? [...store.selection.value.runIds, hovered]
        : store.selection.value.runIds;
      const ordered = [
        ...state.pages.filter((p) =>
          p.runs.some((r) => selected.includes(r.id)),
        ),
        ...state.pages,
      ];
      for (const snapshot of ordered) {
        const page = doc.page(snapshot.pageIndex);
        const scan = page.runs.filter((r) => isScanRun(r) && !done.has(r));
        const run = scan.find((r) => selected.includes(r.id)) ?? scan[0];
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
      document.removeEventListener("pointerover", onPointerOver);
    };
  }, [store, hasScannedText, scannedText, state.pages]);
}
