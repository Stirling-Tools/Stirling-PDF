import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
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
          : t(
              "pdfTextEditor.inspector.scannedText",
              "Scanned text · changed words are covered and redrawn in a matching font.",
            );
      case "embeddedUnknown":
        return t(
          "pdfTextEditor.inspector.fontEmbedded",
          "Embedded font · a character it lacks falls back to Helvetica.",
        );
      case "deviceUnknown":
        return t(
          "pdfTextEditor.inspector.fontUnknownCoverage",
          "{{name}} · a character it lacks falls back to {{fallback}}.",
          { name: note.name, fallback: note.fallback },
        );
      case "completed":
        return note.source === "original"
          ? t(
              "pdfTextEditor.inspector.fontCompletedOriginal",
              "Embedded font · characters it lacks are drawn in {{name}}, the same font.",
              { name: note.name },
            )
          : t(
              "pdfTextEditor.inspector.fontCompletedClosest",
              "Embedded font · characters it lacks are drawn in {{name}}, the closest match available.",
              { name: note.name },
            );
      case "gap":
        return t(
          "pdfTextEditor.inspector.fontGap",
          "{{name}} · missing {{glyphs}} - typing those falls back to {{fallback}}.",
          { name: note.name, glyphs: note.glyphs, fallback: note.fallback },
        );
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
