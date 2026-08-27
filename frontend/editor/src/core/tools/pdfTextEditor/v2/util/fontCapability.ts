import {
  familyOf,
  flipItalic,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";
import {
  faceStyleFlags,
  getLocalFontBytes,
  loadLocalFontBytes,
  loadedLocalFonts,
  pickLocalFontFace,
  splitRequested,
  type LocalFont,
} from "@app/tools/pdfTextEditor/v2/util/localFonts";

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

/** Families {@link warmDocumentDeviceFonts} has already looked up this session. */
const attempted = new Set<string>();

/** Test hook: forget which document families have been matched. */
export function resetDocumentFontMatchCache(): void {
  attempted.clear();
}

/** The installed face for `family` in the requested style, or null. */
function deviceFaceFor(
  fonts: LocalFont[],
  family: string,
  italic: boolean,
): string | null {
  const req = splitRequested(family);
  if (!req.family) return null;
  const wanted = [req.family, req.bold ? "Bold" : "", italic ? "Italic" : ""]
    .filter(Boolean)
    .join(" ");
  const face = pickLocalFontFace(fonts, wanted);
  if (!face) return null;
  // pickLocalFontFace always returns SOMETHING from a matching family, so the
  // style has to be checked: a family with no italic cut answers with upright.
  const flags = faceStyleFlags(face);
  if (flags.italic !== italic) return null;
  return wanted;
}

/**
 * Which family gives `fontId` its italic cut (or its upright one back).
 *
 * base-14 flips in place. Anything else - an embedded or subset face - needs a
 * device font of the same family that genuinely carries the style, which only
 * exists once the user has loaded their device fonts.
 */
export function italicCapability(
  fontId: string,
  italic: boolean,
  fonts: LocalFont[] | null = loadedLocalFonts(),
): StyleCapability {
  const family = familyOf(fontId);
  if (!family) return NONE;
  const flipped = flipItalic(family, italic);
  if (flipped) return { family: flipped, source: "base14" };
  if (!fonts || fonts.length === 0) return NONE;
  const device = deviceFaceFor(fonts, family, italic);
  return device ? { family: device, source: "device" } : NONE;
}

/** Whether every one of these runs can be flipped to the other italic state. */
export function canToggleItalic(
  fontIds: string[],
  fonts: LocalFont[] | null = loadedLocalFonts(),
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
  const family = familyOf(fontId);
  // Readiness IS the opt-in: bytes only exist for a family the user has loaded
  // their device fonts for.
  if (family && getLocalFontBytes(family)) return family;
  return helveticaVariantFor(fontId);
}

/**
 * The font id a run takes on once it re-emits in `family`.
 *
 * Tagging a device family `base14:` is what made the NEXT edit forget it - the
 * prefix is how {@link fallbackFamilyFor} recognises a face worth keeping.
 */
export function fallbackFontIdFor(family: string): string {
  return `${getLocalFontBytes(family) ? "device" : "base14"}:${family}`;
}

/**
 * Read the installed faces matching the DOCUMENT's own families, so a later
 * edit that outgrows a subset has real bytes to complete it from.
 *
 * Only exact family matches are loaded - "Calibri" never warms "Calibri Light"
 * - so recognition stays a match, not a guess. Returns the families matched.
 */
export async function warmDocumentDeviceFonts(
  fontIds: Iterable<string>,
): Promise<string[]> {
  const fonts = loadedLocalFonts();
  if (!fonts || fonts.length === 0) return [];
  const wanted = new Set<string>();
  for (const id of fontIds) {
    const family = familyOf(id);
    // base-14 renders everywhere already; nothing to complete.
    if (!family || flipItalic(family, false)) continue;
    // Every edit re-runs this over the whole page model, and scanning a few
    // thousand installed faces per keystroke is not free.
    if (attempted.has(family)) continue;
    attempted.add(family);
    if (getLocalFontBytes(family)) continue;
    if (pickLocalFontFace(fonts, family)) wanted.add(family);
  }
  const matched: string[] = [];
  for (const family of wanted) {
    if (await loadLocalFontBytes(family)) matched.push(family);
  }
  return matched;
}
