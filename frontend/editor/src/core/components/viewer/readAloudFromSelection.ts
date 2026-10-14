import type { PdfPageGeometry } from "@embedpdf/models";

/**
 * Window event the text selection menu dispatches to start read-aloud at a
 * selection. The selection menu renders inside the engine tree, the
 * read-aloud hook outside it, so they share no context.
 */
export const READ_ALOUD_FROM_SELECTION_EVENT =
  "stirling:read-aloud-from-selection";

export interface ReadAloudFromSelectionDetail {
  /** 1-based. */
  pageNumber: number;
  /** Empty when the document forbids copying its text. */
  selectedText: string;
  /** Where the selection starts, as a 0..1 fraction of the page's glyphs. */
  approximatePosition: number;
}

export function glyphPositionRatio(
  geometry: PdfPageGeometry | undefined,
  glyphIndex: number,
): number {
  const lastRun = geometry?.runs[geometry.runs.length - 1];
  const glyphCount = lastRun ? lastRun.charStart + lastRun.glyphs.length : 0;
  return glyphCount > 0 ? Math.min(1, glyphIndex / glyphCount) : 0;
}

/**
 * Char index in a page's read-aloud text at which to start speaking a
 * selection, snapped back to the start of its word; 0 when it is not found.
 * The selection comes from PDFium and the read-aloud text from pdf.js, so the
 * two can disagree on spacing: the first word alone is tried when the whole
 * selection is not found, and repeated matches go to the one nearest
 * `approximatePosition`.
 */
export function findReadAloudStartIndex(
  spokenText: string,
  selectedText: string,
  approximatePosition: number,
): number {
  const words = selectedText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const target = approximatePosition * spokenText.length;
  for (const needle of [words.join(" "), words[0]]) {
    let best = -1;
    for (
      let i = spokenText.indexOf(needle);
      i !== -1;
      i = spokenText.indexOf(needle, i + 1)
    ) {
      if (best === -1 || Math.abs(i - target) < Math.abs(best - target)) {
        best = i;
      }
    }
    if (best !== -1) return spokenText.lastIndexOf(" ", best) + 1;
  }
  return 0;
}
