import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import {
  documentFontHandle,
  isItalicFamily,
  stripSubsetTag,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  BOLD_WEIGHT,
  parseFaceName,
} from "@editor/tools/pdfTextEditor/util/faceNames";
import { clearOnDocumentClose } from "@editor/tools/pdfTextEditor/pdfium/pointerCaches";

/** The Italic bit of a font descriptor's /Flags (ISO 32000-1, table 123). */
const ITALIC_FLAG = 1 << 6;
/** The ForceBold bit of a font descriptor's /Flags (ISO 32000-1, table 123). */
const FORCE_BOLD_FLAG = 1 << 18;

interface DocumentFontStyle {
  fontId: string;
  /** The family /BaseFont names; empty when the PDF gives no name. */
  family: string;
  italic: boolean;
  weight: number;
}

// Keyed by PDFium font handle, unique only within one open document: cleared when any document closes.
const styleByHandle = new Map<number, DocumentFontStyle>();

export function resetDocumentFontStyles(): void {
  styleByHandle.clear();
}
clearOnDocumentClose(resetDocumentFontStyles);

/**
 * Record a document font's weight and slant. A fontId names the family from
 * the font's own name table when it has one, which leaves the style out
 * ("Georgia" for Georgia Bold Italic), so the style is read from where the PDF
 * states it: the /BaseFont name first, then the descriptor's flags.
 */
export function noteDocumentFontStyle(
  m: WrappedPdfiumModule,
  fontPtr: number,
  family?: string,
): void {
  if (!fontPtr || styleByHandle.has(fontPtr)) return;
  // PDFium answers -1 for a font with no descriptor, which has every bit set.
  const flags = Math.max(0, m.FPDFFont_GetFlags(fontPtr));
  const baseFont = readFontName(m, fontPtr) ?? "";
  const named = parseFaceName(baseFont);
  // Not the descriptor's FontWeight: PDFium estimates it from stem widths when
  // it is missing, which reads regular faces as light or semibold.
  const weight =
    !named.weightStated && flags & FORCE_BOLD_FLAG ? BOLD_WEIGHT : named.weight;
  styleByHandle.set(fontPtr, {
    fontId: `pdf:${fontPtr}:${family ?? stripSubsetTag(baseFont)}`,
    family: named.family,
    italic:
      named.italic || isItalicFamily(baseFont) || (flags & ITALIC_FLAG) !== 0,
    weight,
  });
}

/** The fontId of every document font read so far, whichever run it ended up in. */
export function documentFontIds(): string[] {
  return [...styleByHandle.values()].map((style) => style.fontId);
}

/** The fontId a document font was read under, or null for a font no page read has met. */
export function documentFontIdAt(fontPtr: number): string | null {
  return styleByHandle.get(fontPtr)?.fontId ?? null;
}

/** Whether a run's fontId names an italic face, by its name or by what its document font declares. */
export function isItalicFont(fontId: string): boolean {
  return (
    isItalicFamily(fontId) ||
    styleByHandle.get(documentFontHandle(fontId))?.italic === true
  );
}

/**
 * The family a document font's /BaseFont names, or null for any other font or
 * one not read yet. A fontId names the family PDFium loaded, which for a font
 * the PDF does not embed is the stand-in PDFium drew it with.
 */
export function documentFontFamily(fontId: string): string | null {
  return styleByHandle.get(documentFontHandle(fontId))?.family || null;
}

/** The weight a document font declares, or null for any other font or one not read yet. */
export function documentFontWeight(fontId: string): number | null {
  return styleByHandle.get(documentFontHandle(fontId))?.weight ?? null;
}
