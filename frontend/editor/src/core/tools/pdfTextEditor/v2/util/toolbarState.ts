import {
  isBoldFamily,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import { canToggleItalic } from "@app/tools/pdfTextEditor/v2/util/fontCapability";
import type { LocalFont } from "@app/tools/pdfTextEditor/v2/util/localFonts";
import type {
  PageSnapshot,
  RGBA,
  SelectionState,
  ToolbarState,
} from "@app/tools/pdfTextEditor/v2/types";

export const EMPTY_TOOLBAR: ToolbarState = {
  fontFamily: null,
  fontSize: null,
  fill: null,
  bold: false,
  italic: false,
  canItalic: false,
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

/** Collapse a multi-run selection into a single toolbar snapshot. */
export function deriveToolbarState(
  pages: PageSnapshot[],
  selection: SelectionState,
  localFonts: LocalFont[] | null = null,
): ToolbarState {
  if (selection.runIds.length === 0) return EMPTY_TOOLBAR;
  const selected = pages
    .flatMap((p) => p.runs)
    .filter((r) => selection.runIds.includes(r.id));
  if (selected.length === 0) return EMPTY_TOOLBAR;
  const first = selected[0];
  const sameFamily = selected.every((r) => r.fontId === first.fontId);
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
  const firstBold = isBoldFamily(first.fontId);
  const firstItalic = isItalicFamily(first.fontId);
  const sameBold = selected.every((r) => isBoldFamily(r.fontId) === firstBold);
  const sameItalic = selected.every(
    (r) => isItalicFamily(r.fontId) === firstItalic,
  );
  return {
    fontFamily: first.fontId,
    fontSize: sameSize ? first.fontSize : null,
    fill: sameFill ? first.fill : null,
    bold: firstBold,
    italic: firstItalic,
    canItalic: canToggleItalic(
      selected.map((r) => r.fontId),
      localFonts,
    ),
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
