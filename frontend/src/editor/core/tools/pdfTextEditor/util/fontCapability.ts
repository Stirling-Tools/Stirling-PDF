import { familyOf } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import {
  fontCompletionFor,
  fontNameRefused,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { getExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";

/**
 * The family an edited run re-emits in once its own font cannot author the
 * glyph the user typed.
 *
 * A subset-embedded face only carries the characters the original document
 * used, so typing a new letter drops out of the reuse path. Mapping the run
 * straight to Helvetica there costs the document its typeface for the sake of
 * one character; when the real family is installed and loaded, completing the
 * subset from the device font keeps it.
 */
export function fallbackFamilyFor(fontId: string): string {
  const completion = fontCompletionFor(fontId);
  if (completion) return completion.family;
  const family = familyOf(fontId);
  if (family && !fontNameRefused(fontId) && getExternalFontBytes(family))
    return family;
  return helveticaVariantFor(fontId);
}

/**
 * The font id a run takes on once it re-emits in `family`.
 *
 * Tagging a device family `base14:` is what made the NEXT edit forget it - the
 * prefix is how {@link fallbackFamilyFor} recognises a face worth keeping.
 */
export function fallbackFontIdFor(family: string): string {
  return `${getExternalFontBytes(family) ? "device" : "base14"}:${family}`;
}
