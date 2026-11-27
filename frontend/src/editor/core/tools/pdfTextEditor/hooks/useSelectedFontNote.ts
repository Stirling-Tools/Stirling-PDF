import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  scanBlockMisaligned,
  scanBlockOffInk,
  scanTypingDropped,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { selectedFontNote } from "@editor/tools/pdfTextEditor/util/selectedFontNote";
import { useFontCompletionsGeneration } from "@editor/tools/pdfTextEditor/hooks/useDocumentFontCompletion";
import {
  serverFontBytesVersion,
  subscribeServerFontBytes,
} from "@editor/tools/pdfTextEditor/util/serverFonts";

export type ScanNote = "misaligned" | "offInk" | "dropsTyping" | null;

export function useSelectedFontNote(
  state: EditorViewState,
  selection: SelectionState,
  scanNote: ScanNote = null,
): string | null {
  const { t } = useTranslation();
  const fontBytesVersion = useSyncExternalStore(
    subscribeServerFontBytes,
    serverFontBytesVersion,
    serverFontBytesVersion,
  );
  const completions = useFontCompletionsGeneration();
  return useMemo(() => {
    const note = selectedFontNote(state.pages, selection.runIds);
    if (!note) return null;
    // Only what will go wrong: a note on every selection that is fine
    // crowds out the controls it sits above.
    switch (note.kind) {
      case "scanned":
        if (scanNote === "misaligned")
          return t(
            "pdfTextEditor.inspector.scannedTextMisaligned",
            "Scanned text · its recognised words do not line up with the scan, so this block cannot be edited or deleted.",
          );
        if (scanNote === "offInk")
          return t(
            "pdfTextEditor.inspector.scannedTextOffInk",
            "Scanned text · its recognised words sit off the scanned words, so this block cannot be edited. Run OCR again.",
          );
        return scanNote === "dropsTyping"
          ? t(
              "pdfTextEditor.inspector.scannedTextNoFont",
              "Scanned text · typed words in this script cannot be drawn yet, so they are not kept. Deleting words still works.",
            )
          : null;
      case "gap":
        return t(
          "pdfTextEditor.inspector.fontGap",
          "{{name}} · missing {{glyphs}} - typing those falls back to {{fallback}}.",
          { name: note.name, glyphs: note.glyphs, fallback: note.fallback },
        );
      default:
        return null;
    }
  }, [
    state.pages,
    selection.runIds,
    scanNote,
    fontBytesVersion,
    completions,
    t,
  ]);
}

/** Why typing into the selected text will not come out as expected, or null when it will. */
export function useSelectionNote(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): string | null {
  return useSelectedFontNote(
    state,
    selection,
    selectedScanNote(store, state, selection),
  );
}

function selectedScanNote(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): ScanNote {
  const doc = store.document;
  if (!doc) return null;
  const picked = new Set(selection.runIds);
  const runs = state.pages.flatMap((page) =>
    page.runs.flatMap((r) => {
      if (!picked.has(r.id)) return [];
      const run = doc.page(page.pageIndex).findRun(r.id);
      return run ? [run] : [];
    }),
  );
  if (runs.some((run) => scanBlockMisaligned(doc, run))) return "misaligned";
  if (runs.some((run) => scanBlockOffInk(doc, run))) return "offInk";
  if (runs.some((run) => scanTypingDropped(run))) return "dropsTyping";
  return null;
}
