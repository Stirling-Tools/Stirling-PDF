import { useEffect, useMemo, useRef } from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { subscribePreferredScanFace } from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  loadBundledScanFaces,
  loadScriptScanFaces,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const SLICE_MS = 12;
const GAP_MS = 4;

function nextScanRun(
  doc: EditorDocument,
  skipped: WeakSet<object>,
  wanted: string[],
) {
  let fallback = null;
  for (const page of doc.loadedPages())
    for (const run of page.runs) {
      if (skipped.has(run) || !scanRunNeedsFit(doc, run)) continue;
      if (wanted.includes(run.id)) return { page, run };
      fallback ??= { page, run };
    }
  return fallback;
}

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
  const resume = useRef<() => void>(() => {});
  const text = useRef(scannedText);
  text.current = scannedText;

  useEffect(() => {
    if (!hasScannedText) return;
    let stopped = false;
    let timer = 0;
    let idle = true;
    let hovered: string | null = null;
    const skipped = new WeakSet<object>();
    const onPointerOver = (e: PointerEvent) => {
      const el =
        e.target instanceof Element ? e.target.closest("[data-run-id]") : null;
      hovered = el?.getAttribute("data-run-id") ?? hovered;
    };
    const step = () => {
      const doc = store.document;
      const wanted = [...store.selection.value.runIds];
      if (hovered) wanted.push(hovered);
      const next = !stopped && doc ? nextScanRun(doc, skipped, wanted) : null;
      if (!doc || !next) {
        idle = true;
        return;
      }
      try {
        const finished = prefitScanRun(
          doc,
          next.page,
          next.run,
          performance.now() + SLICE_MS,
        );
        if (finished && scanRunNeedsFit(doc, next.run)) skipped.add(next.run);
      } catch {
        skipped.add(next.run);
      }
      timer = window.setTimeout(step, GAP_MS);
    };
    resume.current = () => {
      if (stopped || !idle) return;
      idle = false;
      timer = window.setTimeout(step, GAP_MS);
    };
    document.addEventListener("pointerover", onPointerOver);
    const unsubscribe = subscribePreferredScanFace(() => resume.current());
    void Promise.all([
      loadBundledScanFaces(),
      loadScriptScanFaces(text.current),
    ]).then(() => resume.current());
    return () => {
      stopped = true;
      resume.current = () => {};
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("pointerover", onPointerOver);
    };
  }, [store, hasScannedText]);

  useEffect(() => {
    if (!hasScannedText) return;
    void loadScriptScanFaces(scannedText).then(() => resume.current());
  }, [hasScannedText, scannedText]);
}
