import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  listLocalFontsIfGranted,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  fontCanBeCompleted,
  fontCompletionFor,
  fontCompletionsGeneration,
  originalFontLookedUp,
  resolveOriginalFonts,
  setClosestFont,
  subscribeFontCompletions,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  loadedExternalFonts,
  subscribeExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import { isDocumentFontId } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { matchableSample } from "@editor/tools/pdfTextEditor/util/matchableSample";
import {
  isScanRun,
  rankFacesForDrawnText,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { fitInSlices } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import {
  loadBundledScanFaces,
  loadDeviceScanFacesIfAllowed,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const closestTried = new WeakMap<EditorDocument, Set<string>>();

/** Changes whenever a completion font is found or forgotten. */
export function useFontCompletionsGeneration(): number {
  return useSyncExternalStore(
    subscribeFontCompletions,
    fontCompletionsGeneration,
    fontCompletionsGeneration,
  );
}

function documentFontsKey(pages: EditorViewState["pages"]): string {
  const ids = new Set<string>();
  for (const page of pages)
    for (const run of page.runs)
      if (!isScanRun(run) && isDocumentFontId(run.fontId)) ids.add(run.fontId);
  return [...ids].sort().join("\n");
}

function selectedFontOf(
  pages: EditorViewState["pages"],
  runIds: string[],
): string | null {
  if (runIds.length !== 1) return null;
  for (const page of pages)
    for (const run of page.runs) if (run.id === runIds[0]) return run.fontId;
  return null;
}

/** Resolves what completes each embedded font: its installed or served original once font lists are in, else the closest face, matched in the background. */
export function useDocumentFontCompletion(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
  externalFonts: LocalFont[] | null,
): void {
  // The picker lists installed fonts when it opens; an edit can need them before that.
  useEffect(() => {
    void listLocalFontsIfGranted();
  }, []);

  const fontsKey = useMemo(() => documentFontsKey(state.pages), [state.pages]);
  const selectedFont = useRef<string | null>(null);
  useEffect(() => {
    selectedFont.current = selectedFontOf(state.pages, selection.runIds);
  }, [state.pages, selection.runIds]);

  useEffect(() => {
    const doc = store.document;
    if (!doc || !externalFonts || !fontsKey) return;
    void resolveOriginalFonts(
      doc.module,
      fontsKey.split("\n"),
      () => store.document === doc,
    );
  }, [store, externalFonts, fontsKey]);

  useEffect(() => {
    const doc = store.document;
    if (!doc || !fontsKey) return;
    const tried = closestTried.get(doc) ?? new Set<string>();
    closestTried.set(doc, tried);
    const fontIds = fontsKey.split("\n");
    let stopped = false;
    let running = false;
    const live = () => !stopped && store.document === doc;

    const wanted = (fontId: string) => {
      if (tried.has(fontId) || fontCompletionFor(fontId)) return false;
      if (!fontCanBeCompleted(doc.module, fontId)) return false;
      // With font lists in, the original gets its chance first; one found later still takes over.
      return !loadedExternalFonts()?.length || originalFontLookedUp(fontId);
    };
    const nextFont = () => {
      const selected = selectedFont.current;
      if (selected && fontIds.includes(selected) && wanted(selected))
        return selected;
      return fontIds.find(wanted) ?? null;
    };

    const matchClosest = async () => {
      if (running) return;
      running = true;
      try {
        await Promise.all([
          loadBundledScanFaces(),
          loadDeviceScanFacesIfAllowed(),
        ]).catch(() => undefined);
        for (let fontId = nextFont(); fontId && live(); fontId = nextFont()) {
          tried.add(fontId);
          const sample = matchableSample(doc, fontId);
          if (!sample) continue;
          const ranked = await fitInSlices(
            () => rankFacesForDrawnText(doc, sample.page, sample.captured),
            live,
          ).catch((err: unknown) => {
            console.warn("[pdf-editor] no closest font found", err);
            return [];
          });
          // Cut off part-way, so the next pass may try this font again.
          if (!ranked) tried.delete(fontId);
          else if (ranked[0]) setClosestFont(fontId, ranked[0].style.family);
        }
      } finally {
        running = false;
      }
    };

    const wake = () => void matchClosest();
    const unsubscribeCompletions = subscribeFontCompletions(wake);
    const unsubscribeFonts = subscribeExternalFonts(wake);
    wake();
    return () => {
      stopped = true;
      unsubscribeCompletions();
      unsubscribeFonts();
    };
  }, [store, fontsKey]);
}
