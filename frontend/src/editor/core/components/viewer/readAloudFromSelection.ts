import type { PdfPageGeometry } from "@embedpdf/models";

/**
 * Window event the text selection menu dispatches to start read-aloud at a
 * selection. Read-aloud state lives in the hook behind the viewer's workbench
 * bar and no context exposes it, so the menu has nothing to call directly.
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

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWholeWordAt(text: string, index: number, length: number): boolean {
  const before = text[index - 1];
  const after = text[index + length];
  return (
    (before === undefined || !WORD_CHAR.test(before)) &&
    (after === undefined || !WORD_CHAR.test(after))
  );
}

function nearestMatch(
  text: string,
  needle: string,
  target: number,
  wholeWordOnly: boolean,
): number {
  let best = -1;
  for (
    let i = text.indexOf(needle);
    i !== -1;
    i = text.indexOf(needle, i + 1)
  ) {
    if (wholeWordOnly && !isWholeWordAt(text, i, needle.length)) continue;
    if (best === -1 || Math.abs(i - target) < Math.abs(best - target)) {
      best = i;
    }
  }
  return best;
}

/**
 * Char index in a page's read-aloud text at which to start speaking a
 * selection, snapped back to the start of its word; 0 when it is not found.
 * The selection comes from PDFium and the read-aloud text from pdf.js, so the
 * two can disagree on spacing: the first word alone is tried when the whole
 * selection is not found. Whole-word matches win over matches inside a longer
 * word, which only a selection starting mid-word needs, and repeated matches
 * go to the one nearest `approximatePosition`.
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
    for (const wholeWordOnly of [true, false]) {
      const match = nearestMatch(spokenText, needle, target, wholeWordOnly);
      if (match !== -1) return spokenText.lastIndexOf(" ", match) + 1;
    }
  }
  return 0;
}
