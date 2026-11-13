import {
  familyOf,
  flipItalic,
  isItalicFamily,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import {
  faceStyleFlags,
  knownFamilyOf,
  pickRequestedFace,
  resolveRequested,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  fontCompletionFor,
  fontNameRefused,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  getExternalFontBytes,
  loadedExternalFonts,
} from "@editor/tools/pdfTextEditor/util/externalFonts";

// Whether a style change is actually possible for a run's face, and in which
// family. The toolbar asks before offering the control: replacing a document's
// own typeface with Helvetica-Oblique is not "making it italic", it is losing
// the font.

export type StyleSource = "base14" | "device";

export interface StyleCapability {
  /** Family to emit, or null when nothing available can render the style. */
  family: string | null;
  source: StyleSource | null;
}

const NONE: StyleCapability = { family: null, source: null };

/** The installed face for `family` in the requested style, or null. */
function deviceFaceFor(
  fonts: LocalFont[],
  family: string,
  italic: boolean,
): string | null {
  const req = resolveRequested(fonts, family);
  if (!req.family) return null;
  const face = pickRequestedFace(fonts, { ...req, italic });
  if (!face) return null;
  // pickRequestedFace always returns SOMETHING from a matching family, so the
  // style has to be checked: a family with no italic cut answers with upright.
  const flags = faceStyleFlags(face);
  if (flags.italic !== italic) return null;
  return [req.family, req.bold ? "Bold" : "", italic ? "Italic" : ""]
    .filter(Boolean)
    .join(" ");
}

/** Base-14 flips in place unless an external family of that name exists; others need a real face. */
export function italicCapability(
  fontId: string,
  italic: boolean,
  fonts: LocalFont[] | null = loadedExternalFonts(),
): StyleCapability {
  const family = familyOf(fontId);
  if (!family) return NONE;
  const flipped = flipItalic(family, italic);
  if (flipped && !hasExternalFamily(fonts, family)) {
    return { family: flipped, source: "base14" };
  }
  if (!fonts || fonts.length === 0) return NONE;
  const device = deviceFaceFor(fonts, family, italic);
  return device ? { family: device, source: "device" } : NONE;
}

function hasExternalFamily(fonts: LocalFont[] | null, family: string): boolean {
  if (!fonts || nearestStandardFont(family) === family) return false;
  return knownFamilyOf(fonts, family) !== null;
}

/** Whether every one of these runs can be flipped to the other italic state. */
export function canToggleItalic(
  fontIds: string[],
  fonts: LocalFont[] | null = loadedExternalFonts(),
): boolean {
  if (fontIds.length === 0) return false;
  // Deduped: each miss costs a linear scan of every installed face, and a
  // select-all hands this thousands of runs sharing a handful of fonts - on
  // every keystroke, because the toolbar state is derived from the snapshot.
  return [...new Set(fontIds)].every(
    (id) => italicCapability(id, !isItalicFamily(id), fonts).family !== null,
  );
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
