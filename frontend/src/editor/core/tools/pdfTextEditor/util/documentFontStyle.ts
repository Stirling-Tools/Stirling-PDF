import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import {
  documentFontHandle,
  isItalicFamily,
} from "@editor/tools/pdfTextEditor/util/fontFamily";

/** The Italic bit of a font descriptor's /Flags (ISO 32000-1, table 123). */
const ITALIC_FLAG = 1 << 6;

// Keyed by PDFium font handle, unique only within one open document: EditorStore resets it with its other pointer-keyed caches.
const italicByHandle = new Map<number, boolean>();

export function resetDocumentFontStyles(): void {
  italicByHandle.clear();
}

/**
 * Record whether a document font is an italic face. A fontId names the family
 * from the font's own name table when it has one, which leaves the style out
 * ("Georgia" for Georgia Italic), so the style is read from where the PDF
 * states it: the /BaseFont name and the descriptor's Italic flag.
 */
export function noteDocumentFontStyle(
  m: WrappedPdfiumModule,
  fontPtr: number,
): void {
  if (!fontPtr || italicByHandle.has(fontPtr)) return;
  // PDFium answers -1 for a font with no descriptor, which has every bit set.
  const flags = Math.max(0, m.FPDFFont_GetFlags(fontPtr));
  italicByHandle.set(
    fontPtr,
    isItalicFamily(readFontName(m, fontPtr) ?? "") ||
      (flags & ITALIC_FLAG) !== 0,
  );
}

/** Whether a run's fontId names an italic face, by its name or by what its document font declares. */
export function isItalicFont(fontId: string): boolean {
  return (
    isItalicFamily(fontId) ||
    italicByHandle.get(documentFontHandle(fontId)) === true
  );
}
