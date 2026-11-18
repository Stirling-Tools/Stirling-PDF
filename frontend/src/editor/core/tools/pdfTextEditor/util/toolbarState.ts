import { isBoldWeight } from "@editor/tools/pdfTextEditor/util/faceNames";
import {
  canRestyle,
  faceStyleOf,
  familyHasStyle,
  familiesOfFont,
  fontFamilyKey,
  hasExtraWeights,
  knownDocumentFamilies,
  type FaceSources,
  type ToggleRequest,
} from "@editor/tools/pdfTextEditor/util/fontFaces";
import type { LocalFont } from "@editor/tools/pdfTextEditor/util/localFonts";
import type {
  PageSnapshot,
  RGBA,
  SelectionState,
  ToolbarState,
} from "@editor/tools/pdfTextEditor/types";

export const EMPTY_TOOLBAR: ToolbarState = {
  fontFamily: null,
  documentFontId: null,
  fontSize: null,
  fill: null,
  bold: false,
  italic: false,
  canBold: false,
  canItalic: false,
  boldNeedsBoldItalic: false,
  italicNeedsBoldItalic: false,
  weight: null,
  weights: [],
  documentFamilies: [],
  stroke: null,
  strokeWidth: null,
  mixed: {
    fontFamily: false,
    fontSize: false,
    fill: false,
    bold: false,
    italic: false,
    stroke: false,
    strokeWidth: false,
  },
};

/**
 * Collapse a multi-run selection into a single toolbar snapshot. `rangeFontIds`
 * are the fonts drawing the characters selected inside the one selected run,
 * when only some of its text is selected: the font controls then describe
 * those characters, not the run.
 */
export function deriveToolbarState(
  pages: PageSnapshot[],
  selection: SelectionState,
  localFonts: LocalFont[] | null = null,
  rangeFontIds: readonly string[] | null = null,
): ToolbarState {
  if (selection.runIds.length === 0) return EMPTY_TOOLBAR;
  const selected = pages
    .flatMap((p) => p.runs)
    .filter((r) => selection.runIds.includes(r.id));
  if (selected.length === 0) return EMPTY_TOOLBAR;
  const first = selected[0];
  const inRange = rangeFontIds !== null && rangeFontIds.length > 0;
  const fontId = inRange ? rangeFontIds[0] : first.fontId;
  // Bold and regular words of one family are one family, as a word processor shows them.
  const sameFamily = inRange
    ? rangeFontIds.every((id) => fontFamilyKey(id) === fontFamilyKey(fontId))
    : selected.every((r) => r.fontId === first.fontId);
  const sameSize = selected.every((r) => r.fontSize === first.fontSize);
  const sameFill = selected.every(
    (r) =>
      r.fill.r === first.fill.r &&
      r.fill.g === first.fill.g &&
      r.fill.b === first.fill.b &&
      r.fill.a === first.fill.a,
  );
  const firstStroke = first.stroke ?? null;
  const sameStroke = selected.every((r) =>
    sameRgba(r.stroke ?? null, firstStroke),
  );
  const firstStrokeWidth = first.strokeWidth ?? 0;
  const sameStrokeWidth = selected.every(
    (r) => (r.strokeWidth ?? 0) === firstStrokeWidth,
  );
  // Per font, not per run: a select-all hands this thousands of runs sharing a
  // handful of fonts, on every keystroke.
  const fontIds = inRange
    ? [...new Set(rangeFontIds)]
    : [...new Set(selected.map((r) => r.fontId))];
  const styles = fontIds.map(faceStyleOf);
  const allBold = styles.every((style) => isBoldWeight(style.weight));
  const allItalic = styles.every((style) => style.italic);
  const sameBold = allBold || styles.every((s) => !isBoldWeight(s.weight));
  const sameItalic = allItalic || styles.every((style) => !style.italic);
  const sameWeight = styles.every((s) => s.weight === styles[0].weight);
  const sources: FaceSources = {
    documentFamilies: knownDocumentFamilies(
      pages.flatMap((p) =>
        p.runs.flatMap((r) =>
          r.documentFontId ? [r.fontId, r.documentFontId] : [r.fontId],
        ),
      ),
    ),
    externalFonts: localFonts,
  };
  const canBold = canRestyle(fontIds, { bold: !allBold }, sources);
  const canItalic = canRestyle(fontIds, { italic: !allItalic }, sources);
  const lacksOnlyBoldItalic = (request: ToggleRequest) =>
    fontIds.every((id) => familyHasStyle(id, request, sources));
  const family = sameFamily ? familiesOfFont(fontId, sources)[0] : null;
  const documentFontId = first.documentFontId ?? null;
  const sameDocumentFont = selected.every(
    (r) => (r.documentFontId ?? null) === documentFontId,
  );
  return {
    fontFamily: fontId,
    documentFontId: sameDocumentFont ? documentFontId : null,
    fontSize: sameSize ? first.fontSize : null,
    fill: sameFill ? first.fill : null,
    bold: allBold,
    italic: allItalic,
    canBold,
    canItalic,
    boldNeedsBoldItalic:
      !canBold && !allBold && allItalic && lacksOnlyBoldItalic({ bold: true }),
    italicNeedsBoldItalic:
      !canItalic &&
      !allItalic &&
      allBold &&
      lacksOnlyBoldItalic({ italic: true }),
    weight: sameWeight ? styles[0].weight : null,
    weights:
      family && hasExtraWeights(family)
        ? [...new Set(family.faces.map((face) => face.weight))]
        : [],
    documentFamilies: sources.documentFamilies,
    stroke: sameStroke ? firstStroke : null,
    strokeWidth: sameStrokeWidth ? firstStrokeWidth : null,
    mixed: {
      fontFamily: !sameFamily,
      fontSize: !sameSize,
      fill: !sameFill,
      bold: !sameBold,
      italic: !sameItalic,
      stroke: !sameStroke,
      strokeWidth: !sameStrokeWidth,
    },
  };
}

function sameRgba(a: RGBA | null, b: RGBA | null): boolean {
  if (a === null || b === null) return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
