import {
  isBoldFamily,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import type {
  PageSnapshot,
  SelectionState,
  ToolbarState,
} from "@app/tools/pdfTextEditor/v2/types";

export const EMPTY_TOOLBAR: ToolbarState = {
  fontFamily: null,
  fontSize: null,
  fill: null,
  bold: false,
  italic: false,
  mixed: {
    fontFamily: false,
    fontSize: false,
    fill: false,
    bold: false,
    italic: false,
  },
};

/** Collapse a multi-run selection into a single toolbar snapshot. */
export function deriveToolbarState(
  pages: PageSnapshot[],
  selection: SelectionState,
): ToolbarState {
  if (selection.runIds.length === 0) return EMPTY_TOOLBAR;
  const selected = pages
    .flatMap((p) => p.runs)
    .filter((r) => selection.runIds.includes(r.id));
  if (selected.length === 0) return EMPTY_TOOLBAR;
  const first = selected[0];
  const sameSize = selected.every((r) => r.fontSize === first.fontSize);
  const sameFill = selected.every(
    (r) =>
      r.fill.r === first.fill.r &&
      r.fill.g === first.fill.g &&
      r.fill.b === first.fill.b &&
      r.fill.a === first.fill.a,
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
    mixed: {
      fontFamily: false,
      fontSize: !sameSize,
      fill: !sameFill,
      bold: !sameBold,
      italic: !sameItalic,
    },
  };
}
