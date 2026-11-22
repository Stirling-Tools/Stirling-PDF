import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { xHeightEm } from "@editor/tools/pdfTextEditor/charcode/fontGlyphs";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import { parseFontMetrics } from "@editor/tools/pdfTextEditor/util/fontMetrics";
import {
  COURIER,
  HELVETICA,
  TIMES,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const MATCH_LIMITS = { min: 0.85, max: 1.25 };

function standardXHeightEm(family: string): number | null {
  for (const face of [HELVETICA, TIMES, COURIER])
    if (family.startsWith(face.family.split("-")[0])) return face.xh / 1000;
  return null;
}

function familyXHeightEm(family: string): number | null {
  const standard = standardXHeightEm(family);
  if (standard !== null) return standard;
  const bytes = getExternalFontBytes(family);
  const metrics = bytes ? parseFontMetrics(bytes) : null;
  return metrics ? metrics.xh / 1000 : null;
}

/**
 * The size to draw `family` at in place of the document font `fontPtr` so
 * both have lower-case letters of one height: at one point size a face with
 * shorter letters reads as smaller type mid-sentence. `size` when either
 * height is unknown, and never scaled past {@link MATCH_LIMITS}.
 */
export function fallbackSizeMatching(
  m: WrappedPdfiumModule,
  fontPtr: number,
  family: string,
  size: number,
): number {
  return matched(xHeightEm(m, fontPtr), familyXHeightEm(family), size);
}

/** {@link fallbackSizeMatching} for a stand-in font already in the document. */
export function standInSizeMatching(
  m: WrappedPdfiumModule,
  fontPtr: number,
  standInPtr: number,
  size: number,
): number {
  return matched(xHeightEm(m, fontPtr), xHeightEm(m, standInPtr), size);
}

function matched(
  own: number | null,
  other: number | null,
  size: number,
): number {
  if (!own || !other) return size;
  return (
    size * Math.min(MATCH_LIMITS.max, Math.max(MATCH_LIMITS.min, own / other))
  );
}
