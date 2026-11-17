import {
  familyOf,
  isDocumentFontId,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import {
  fontCompletionFor,
  fontNameRefused,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  getExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  restyledFace,
  type FaceSources,
  type StyleRequest,
} from "@editor/tools/pdfTextEditor/util/fontFaces";

// Whether a style change is actually possible for a run's face, and in which
// face. The toolbar asks before offering the control: replacing a document's
// own typeface with Helvetica-Oblique is not "making it italic", it is losing
// the font.

export type StyleSource = "base14" | "device" | "document";

export interface StyleCapability {
  /** Face to emit, or null when nothing available can render the style. */
  family: string | null;
  source: StyleSource | null;
}

const NONE: StyleCapability = { family: null, source: null };

/** The face a run moves to for `request`; null family when its family has no such face or the run is already in that style. */
export function styleCapability(
  fontId: string,
  request: StyleRequest,
  sources: FaceSources = {
    documentFamilies: [],
    externalFonts: loadedExternalFonts(),
  },
): StyleCapability {
  const family = restyledFace(fontId, request, sources);
  if (!family) return NONE;
  if (isDocumentFontId(family)) return { family, source: "document" };
  if (nearestStandardFont(family) === family)
    return { family, source: "base14" };
  return { family, source: "device" };
}

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
