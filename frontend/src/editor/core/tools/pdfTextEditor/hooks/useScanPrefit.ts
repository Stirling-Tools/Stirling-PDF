import { useEffect, useMemo, useRef } from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  isScanRun,
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { subscribePreferredScanFace } from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  FIT_GAP_MS,
  FIT_SLICE_MS,
} from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import {
  loadBundledScanFaces,
  loadDeviceScanFacesIfAllowed,
  loadScriptScanFaces,
  noteRankedWithCurrentFaces,
  scanScriptsOf,
  subscribeScanFaces,
  type Script,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const UNSHOWN_RECHECK_MS = 500;

const scriptsByPage = new WeakMap<PageSnapshot, Script[] | null>();

function pageScripts(page: PageSnapshot): Script[] | null {
  let scripts = scriptsByPage.get(page);
  if (scripts === undefined) {
    const text = page.runs.filter(isScanRun).map((run) => run.text);
    scripts = text.length > 0 ? scanScriptsOf(text.join(" ")) : null;
    scriptsByPage.set(page, scripts);
  }
  return scripts;
}

function nextScanRun(
  doc: EditorDocument,
  store: EditorStore,
  skipped: WeakSet<object>,
  wanted: string[],
) {
  let fallback = null;
  for (const page of doc.loadedPages()) {
    if (!page.shownInViewer) continue;
    const near = store.isPageNearViewport(page.index);
    for (const run of page.runs) {
      const isWanted = wanted.includes(run.id);
      if (!isWanted && (!near || fallback)) continue;
      if (skipped.has(run) || !scanRunNeedsFit(doc, run)) continue;
      if (isWanted) return { page, run };
      fallback = { page, run };
    }
  }
  return fallback;
}

const awaitsViewer = (
  doc: EditorDocument,
  store: EditorStore,
  wanted: string[],
) =>
  doc
    .loadedPages()
    .some(
      (page) =>
        !page.shownInViewer &&
        page.runs.some(
          (run) =>
            (store.isPageNearViewport(page.index) || wanted.includes(run.id)) &&
            scanRunNeedsFit(doc, run),
        ),
    );

export function useScanPrefit(
  store: EditorStore,
  state: EditorViewState,
): void {
  const { hasScannedText, scripts } = useMemo(() => {
    const found = new Set<Script>();
    let scanned = false;
    for (const page of state.pages) {
      const own = pageScripts(page);
      if (!own) continue;
      scanned = true;
      for (const script of own) found.add(script);
    }
    return { hasScannedText: scanned, scripts: [...found].sort() };
  }, [state.pages]);
  const scriptKey = scripts.join(" ");
  const resume = useRef<() => void>(() => {});
  const scriptsRef = useRef(scripts);
  scriptsRef.current = scripts;

  useEffect(() => {
    if (!hasScannedText) return;
    let stopped = false;
    let ready = false;
    let timer = 0;
    let idle = true;
    let fittedSinceSnapshot = false;
    let hovered: string | null = null;
    const skipped = new WeakSet<object>();
    const onPointerOver = (e: PointerEvent) => {
      const el =
        e.target instanceof Element ? e.target.closest("[data-run-id]") : null;
      const id = el?.getAttribute("data-run-id");
      if (!id || id === hovered) return;
      hovered = id;
      resume.current();
    };
    const step = () => {
      const doc = store.document;
      const wanted = [...store.selection.value.runIds];
      if (hovered) wanted.push(hovered);
      const next =
        !stopped && doc && !document.hidden
          ? nextScanRun(doc, store, skipped, wanted)
          : null;
      if (!doc || !next) {
        if (
          doc &&
          !stopped &&
          !document.hidden &&
          awaitsViewer(doc, store, wanted)
        )
          timer = window.setTimeout(step, UNSHOWN_RECHECK_MS);
        else idle = true;
        // The editing layer and the font box both read the match from the run snapshots.
        if (idle && fittedSinceSnapshot) {
          fittedSinceSnapshot = false;
          store.resnapshot();
        }
        return;
      }
      try {
        const finished = prefitScanRun(
          doc,
          next.page,
          next.run,
          performance.now() + FIT_SLICE_MS,
        );
        const ranked = next.run.scanEdit?.block?.ranked;
        if (finished && scanRunNeedsFit(doc, next.run)) skipped.add(next.run);
        else if (finished && ranked) {
          noteRankedWithCurrentFaces(ranked);
          // A fit changes no page content, so nothing else marks the snapshot stale.
          next.page.bumpRevision();
          fittedSinceSnapshot = true;
        }
      } catch (err) {
        console.warn("[pdf-editor] scanned text could not be fitted", err);
        skipped.add(next.run);
      }
      timer = window.setTimeout(step, FIT_GAP_MS);
    };
    resume.current = () => {
      if (stopped || !ready || !idle) return;
      idle = false;
      timer = window.setTimeout(step, FIT_GAP_MS);
    };
    const wake = () => resume.current();
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("visibilitychange", wake);
    const unsubscribePreferred = subscribePreferredScanFace(wake);
    const unsubscribeFaces = subscribeScanFaces(wake);
    const unsubscribeNear = store.subscribeNearViewport(wake);
    const unsubscribeSelection = store.selection.subscribe(wake);
    void Promise.all([
      loadBundledScanFaces(),
      loadScriptScanFaces(scriptsRef.current),
    ])
      .catch(() => undefined)
      .then(() => {
        ready = true;
        resume.current();
      });
    return () => {
      stopped = true;
      resume.current = () => {};
      window.clearTimeout(timer);
      unsubscribePreferred();
      unsubscribeFaces();
      unsubscribeNear();
      unsubscribeSelection();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [store, hasScannedText]);

  useEffect(() => {
    if (!hasScannedText) return;
    void loadScriptScanFaces(scriptsRef.current).then(() => resume.current());
    // Not awaited: installed fonts can take seconds to read; bundled faces suffice to start and later arrivals re-rank.
    void loadDeviceScanFacesIfAllowed().catch(() => undefined);
  }, [hasScannedText, scriptKey]);

  useEffect(() => {
    resume.current();
  }, [state.pages]);
}
