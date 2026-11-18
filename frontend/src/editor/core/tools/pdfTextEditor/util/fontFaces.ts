// Fonts as families of faces: the picker lists a family once, and the bold,
// italic and weight controls move a run between the faces its family really
// has. A face is only ever one that exists; nothing here synthesises a style.

import {
  BOLD_WEIGHT,
  REGULAR_WEIGHT,
  familyKey,
  isBoldWeight,
  parseFaceName,
  type FaceStyle,
  type ParsedFaceName,
} from "@editor/tools/pdfTextEditor/util/faceNames";
import {
  familyOf,
  isDocumentFontId,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  documentFontFamily,
  documentFontIds,
  documentFontWeight,
  isItalicFont,
} from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import {
  faceStyleFlags,
  type LocalFont,
} from "@editor/tools/pdfTextEditor/util/localFonts";

export interface FaceOption extends FaceStyle {
  /** What a font change takes to draw in this face: a standard font name, an external face name, or a document fontId. */
  value: string;
}

export interface FontFamilyEntry {
  key: string;
  label: string;
  /** The face nearest the upright regular one, which stands for the family in the picker. */
  value: string;
  faces: FaceOption[];
}

/** One run font's view of the faces it can move to: the document's own faces and the loaded external ones. */
export interface FaceSources {
  documentFamilies: FontFamilyEntry[];
  externalFonts: LocalFont[] | null;
}

export type ToggleRequest = { bold: boolean } | { italic: boolean };

export type StyleRequest = ToggleRequest | { weight: number };

type NamedFace = FaceOption & { family: string };

const BUILT_IN_FACE_NAMES = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
];

function distance(face: FaceStyle, want: FaceStyle): number {
  return (
    Math.abs(face.weight - want.weight) +
    (face.italic === want.italic ? 0 : 1e4)
  );
}

function nearest<T extends FaceStyle>(faces: T[], want: FaceStyle): T | null {
  let best: T | null = null;
  for (const face of faces)
    if (!best || distance(face, want) < distance(best, want)) best = face;
  return best;
}

function familyEntry(label: string, faces: NamedFace[]): FontFamilyEntry {
  const unique: NamedFace[] = [];
  for (const face of faces) {
    if (
      !unique.some((u) => u.weight === face.weight && u.italic === face.italic)
    )
      unique.push(face);
  }
  unique.sort(
    (a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight,
  );
  const regular =
    nearest(unique, { weight: REGULAR_WEIGHT, italic: false }) ?? unique[0];
  return {
    key: familyKey(label),
    label: regular.family || label,
    value: regular.value,
    faces: unique.map(({ value, weight, italic }) => ({
      value,
      weight,
      italic,
    })),
  };
}

/** Faces grouped into families by name, in the order each family first appears. */
function groupFaces(faces: NamedFace[]): FontFamilyEntry[] {
  const byKey = new Map<string, NamedFace[]>();
  for (const face of faces) {
    const key = familyKey(face.family);
    const members = byKey.get(key);
    if (members) members.push(face);
    else byKey.set(key, [face]);
  }
  return [...byKey.values()].map((members) =>
    familyEntry(members[0].family, members),
  );
}

export const BUILT_IN_FAMILIES: FontFamilyEntry[] = groupFaces(
  BUILT_IN_FACE_NAMES.map((name) => ({ value: name, ...parseFaceName(name) })),
);

const BUILT_IN_KEYS = new Set(BUILT_IN_FAMILIES.map((entry) => entry.key));

function statedWeight(text: string): number | null {
  const parsed = parseFaceName(`x ${text}`);
  return parsed.weightStated ? parsed.weight : null;
}

function externalWeight(font: LocalFont, named: ParsedFaceName): number {
  const own = font.axes
    ? (font.axes.weight ?? (font.axes.bold ? BOLD_WEIGHT : REGULAR_WEIGHT))
    : (statedWeight(font.style) ??
      statedWeight(font.postscriptName.split("-").slice(1).join(" ")) ??
      (faceStyleFlags(font).bold ? BOLD_WEIGHT : REGULAR_WEIGHT));
  // A family named for its weight ("Segoe UI Semibold") calls that cut "Regular".
  return own !== REGULAR_WEIGHT || !named.weightStated ? own : named.weight;
}

// The picker name `pickLocalFontFace` resolves back to this face. Regular and
// bold cuts go by family and style words; any other weight by its full name.
function externalFaceValue(
  font: LocalFont,
  named: ParsedFaceName,
  style: FaceStyle,
): string {
  const family = named.weightStated ? named.family : font.family;
  if (style.weight === REGULAR_WEIGHT)
    return style.italic ? `${family} Italic` : family;
  if (style.weight === BOLD_WEIGHT)
    return style.italic ? `${family} Bold Italic` : `${family} Bold`;
  return font.fullName || `${font.family} ${font.style}`.trim();
}

const externalCache = new WeakMap<LocalFont[], FontFamilyEntry[]>();

/** Server or device faces as families, sorted by name. Reference-stable per font list. */
export function externalFamilies(fonts: LocalFont[] | null): FontFamilyEntry[] {
  if (!fonts) return [];
  const cached = externalCache.get(fonts);
  if (cached) return cached;
  const faces = fonts.flatMap((font) => {
    if (!font.family) return [];
    const named = parseFaceName(font.family);
    const style = {
      weight: externalWeight(font, named),
      italic: named.italic || faceStyleFlags(font).italic,
    };
    return [
      {
        ...style,
        family: named.family,
        value: externalFaceValue(font, named, style),
      },
    ];
  });
  const families = groupFaces(faces).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  externalCache.set(fonts, families);
  return families;
}

/** The weight and slant of the face a run is drawn in. */
export function faceStyleOf(fontId: string): FaceStyle {
  const named = parseFaceName(familyOf(fontId));
  return {
    weight: documentFontWeight(fontId) ?? named.weight,
    italic: named.italic || isItalicFont(fontId),
  };
}

function familyNameOf(fontId: string): string {
  return documentFontFamily(fontId) ?? parseFaceName(familyOf(fontId)).family;
}

export function fontFamilyKey(fontId: string): string {
  return familyKey(familyNameOf(fontId));
}

/** The document's fonts as families: those `fontIds` name and every one read from its pages. */
export function knownDocumentFamilies(
  fontIds: Iterable<string>,
): FontFamilyEntry[] {
  return documentFamilies([...fontIds, ...documentFontIds()]);
}

/** The document fonts among `fontIds` as families. */
export function documentFamilies(fontIds: Iterable<string>): FontFamilyEntry[] {
  const faces: NamedFace[] = [];
  for (const fontId of new Set(fontIds)) {
    if (!isDocumentFontId(fontId)) continue;
    // The font's own name for its family reads better ("Liberation Sans" over "LiberationSans") when it is the same family.
    const named = parseFaceName(familyOf(fontId)).family;
    const family = familyNameOf(fontId);
    faces.push({
      ...faceStyleOf(fontId),
      family: familyKey(named) === familyKey(family) ? named : family,
      value: fontId,
    });
  }
  return groupFaces(faces);
}

/** The families a run's font can move within, the document's own faces first. */
export function familiesOfFont(
  fontId: string,
  sources: FaceSources,
): FontFamilyEntry[] {
  const key = fontFamilyKey(fontId);
  if (BUILT_IN_KEYS.has(key))
    return BUILT_IN_FAMILIES.filter((entry) => entry.key === key);
  const own = sources.documentFamilies.find((entry) => entry.key === key);
  const external = externalFamilies(sources.externalFonts).find(
    (entry) => entry.key === key,
  );
  // "Times New Roman" and "Courier New" with no face of their own still have the standard font they are drawn after.
  const standard = BUILT_IN_FAMILIES.find((entry) => key.startsWith(entry.key));
  return [own, external, standard].filter(
    (entry): entry is FontFamilyEntry => !!entry,
  );
}

function faceFor(
  entry: FontFamilyEntry,
  current: FaceStyle,
  request: StyleRequest,
): FaceOption | null {
  if ("bold" in request) {
    return nearest(
      entry.faces.filter(
        (f) =>
          f.italic === current.italic &&
          isBoldWeight(f.weight) === request.bold,
      ),
      {
        weight: request.bold ? BOLD_WEIGHT : REGULAR_WEIGHT,
        italic: current.italic,
      },
    );
  }
  if ("italic" in request) {
    return nearest(
      entry.faces.filter(
        (f) =>
          f.italic === request.italic &&
          isBoldWeight(f.weight) === isBoldWeight(current.weight),
      ),
      { weight: current.weight, italic: request.italic },
    );
  }
  return nearest(
    entry.faces.filter((f) => f.weight === request.weight),
    { weight: request.weight, italic: current.italic },
  );
}

function alreadyStyled(current: FaceStyle, request: StyleRequest): boolean {
  if ("bold" in request) return isBoldWeight(current.weight) === request.bold;
  if ("italic" in request) return current.italic === request.italic;
  return current.weight === request.weight;
}

/**
 * The face a run's font takes on for `request`: undefined when it is already
 * in that style, null when its family has no such face.
 */
export function restyledFace(
  fontId: string,
  request: StyleRequest,
  sources: FaceSources,
): string | null | undefined {
  const current = faceStyleOf(fontId);
  if (alreadyStyled(current, request)) return undefined;
  for (const entry of familiesOfFont(fontId, sources)) {
    const face = faceFor(entry, current, request);
    if (face) return face.value;
  }
  return null;
}

/** Whether a run's family has any face of `request`'s weight or slant, whatever its other axis. */
export function familyHasStyle(
  fontId: string,
  request: ToggleRequest,
  sources: FaceSources,
): boolean {
  return familiesOfFont(fontId, sources).some((entry) =>
    entry.faces.some((face) =>
      "bold" in request
        ? isBoldWeight(face.weight) === request.bold
        : face.italic === request.italic,
    ),
  );
}

/** Whether every one of these runs is in `request`'s style or has a face for it. */
export function canRestyle(
  fontIds: string[],
  request: StyleRequest,
  sources: FaceSources,
): boolean {
  if (fontIds.length === 0) return false;
  return [...new Set(fontIds)].every(
    (id) => restyledFace(id, request, sources) !== null,
  );
}

/** The face of `entry` nearest a run's own weight and slant, so picking a family keeps bold text bold. */
export function faceKeepingStyle(
  entry: FontFamilyEntry,
  style: FaceStyle,
): string {
  const sameClass = entry.faces.filter(
    (f) =>
      f.italic === style.italic &&
      isBoldWeight(f.weight) === isBoldWeight(style.weight),
  );
  return (nearest(sameClass, style) ?? nearest(entry.faces, style) ?? entry)
    .value;
}

/** The family `value` is a face of, among every family the picker can list. */
export function familyOfFace(
  value: string,
  sources: FaceSources,
): FontFamilyEntry | null {
  const all = [
    ...sources.documentFamilies,
    ...BUILT_IN_FAMILIES,
    ...externalFamilies(sources.externalFonts),
  ];
  return (
    all.find((entry) => entry.faces.some((f) => f.value === value)) ?? null
  );
}

/** Whether a family has a weight beyond regular and bold, which the toggles alone cannot reach. */
export function hasExtraWeights(entry: FontFamilyEntry): boolean {
  return entry.faces.some(
    (f) => f.weight !== REGULAR_WEIGHT && f.weight !== BOLD_WEIGHT,
  );
}
