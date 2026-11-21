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
    "That font can't show this text. Try another font.",
  ],
  missingGlyphs: [
    "pdfTextEditor.fontPicker.missingGlyphs",
    "Some of these characters aren't in that font, so the text keeps its current font.",
  ],
  documentFontCannotDraw: [
    "pdfTextEditor.fontPicker.documentFontCannotDraw",
    "This text can't be redrawn in the document's own font, so it keeps its current font.",
  ],
  someLeftUnchanged: [
    "pdfTextEditor.fontPicker.someLeftUnchanged",
    "Some of the text isn't in that font, so that part keeps its current font.",
  ],
  closestMatch: [
    "pdfTextEditor.fontPicker.closestMatch",
    "This font is missing some of the selected letters, so they are drawn in the closest matching font.",
  ],
  styleUnavailable: [
    "pdfTextEditor.fontPicker.styleUnavailable",
    "This font doesn't come in that style. Try another font family.",
  ],
  styleSkipped: [
    "pdfTextEditor.fontPicker.styleSkipped",
    "Some of the text's fonts don't come in that style, so that part stays as it was.",
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
