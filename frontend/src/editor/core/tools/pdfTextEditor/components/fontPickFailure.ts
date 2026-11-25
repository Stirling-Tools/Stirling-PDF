import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@editor/components/toast";
import type { FontPickFailure } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";

const PICK_FAILURE_TEXT: Record<FontPickFailure, [string, string]> = {
  needsShaping: [
    "pdfTextEditor.fontPicker.needsShaping",
    "The editor can't yet redraw this script's joined letters and vowel signs correctly, so that text was left in its current font.",
  ],
  serverFontFailed: [
    "pdfTextEditor.fontPicker.serverFontFailed",
    "That server font could not be downloaded. The text was left unchanged.",
  ],
  embeddingForbidden: [
    "pdfTextEditor.fontPicker.embeddingForbidden",
    "This font's licence does not allow embedding it in a PDF. The text was left unchanged.",
  ],
  embedFailed: [
    "pdfTextEditor.fontPicker.embedFailed",
    "This font could not be embedded in the PDF. The text was left unchanged.",
  ],
  noGlyphs: [
    "pdfTextEditor.fontPicker.noGlyphs",
    "This font has no characters for the selected text. The text was left unchanged.",
  ],
  missingGlyphs: [
    "pdfTextEditor.fontPicker.missingGlyphs",
    "This font is missing some of the selected characters, and they could not be kept in their current font. The text was left unchanged.",
  ],
  documentFontCannotDraw: [
    "pdfTextEditor.fontPicker.documentFontCannotDraw",
    "The editor can't draw this text in the document's own font, so it was left in its current font.",
  ],
  someLeftUnchanged: [
    "pdfTextEditor.fontPicker.someLeftUnchanged",
    "This font does not have the characters for some of the selected text. That text was left unchanged.",
  ],
  closestMatch: [
    "pdfTextEditor.fontPicker.closestMatch",
    "This font is missing some of the selected letters, so they are drawn in the closest matching font.",
  ],
  styleUnavailable: [
    "pdfTextEditor.fontPicker.styleUnavailable",
    "The selected text has no version of its font in that style, so it was left unchanged.",
  ],
  styleSkipped: [
    "pdfTextEditor.fontPicker.styleSkipped",
    "Some of the selected text has no version of its font in that style, so it was left unchanged.",
  ],
  partOfRunUnsupported: [
    "pdfTextEditor.fontPicker.partOfRunUnsupported",
    "This text can only be restyled as a whole. Select the box instead of some of its words.",
  ],
};

/** Applies a font or style change and warns about whatever it could not do as asked. */
export function useFontChangeWarning(): (
  change: () => void | Promise<FontPickFailure | null>,
) => Promise<void> {
  const { t } = useTranslation();
  return useCallback(
    async (change) => {
      const failure = await change();
      if (!failure) return;
      const [key, fallback] = PICK_FAILURE_TEXT[failure];
      alert({
        alertType: "warning",
        title: t(key, fallback),
        expandable: false,
      });
    },
    [t],
  );
}
