import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type {
  PageRect,
  RGBA,
  TableCellStyle,
} from "@app/tools/pdfTextEditor/types";
import {
  familyOf,
  nearestStandardFont,
} from "@app/tools/pdfTextEditor/util/fontFamily";

// Reads a table's existing text back into the style new cells should be written
// in. PDF carries no table styling of its own, so "the column's style" is
// whatever its current entries agree on.

// One existing cell. `left`/`right` are the text's MEASURED extents, not
// run.bounds: splitting a paragraph leaves every member line carrying the
// parent's width, which makes both cell edges look equally well aligned.
export interface StyledCell {
  run: TextRun;
  rect: PageRect;
  left: number;
  right: number;
}

/** Alignment is judged by which edge the entries line up against. */
const ALIGN_TOLERANCE_PT = 1.5;

function mode<T>(values: T[], key: (v: T) => string): T | null {
  const counts = new Map<string, { n: number; value: T }>();
  for (const v of values) {
    const k = key(v);
    const hit = counts.get(k);
    if (hit) hit.n++;
    else counts.set(k, { n: 1, value: v });
  }
  let best: { n: number; value: T } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  return best ? best.value : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Left- vs right-aligned is decided by which edge the entries agree on: the
// spread of their distances from the cell's left edge against the spread from
// its right. Centred wins only when both edges vary but the centres do not.
function alignmentOf(cells: StyledCell[]): TableCellStyle["align"] {
  if (cells.length === 0) return "left";
  // A single entry cannot show which edge the column agrees on, but the edge it
  // sits closest to is still the better guess than assuming left.
  if (cells.length === 1) {
    const [c] = cells;
    const lead = c.left - c.rect.x;
    const trail = c.rect.x + c.rect.width - c.right;
    if (Math.abs(lead - trail) <= ALIGN_TOLERANCE_PT) return "center";
    return trail < lead ? "right" : "left";
  }
  const lefts = cells.map((c) => c.left - c.rect.x);
  const rights = cells.map((c) => c.rect.x + c.rect.width - c.right);
  const centres = cells.map(
    (c) => (c.left + c.right) / 2 - (c.rect.x + c.rect.width / 2),
  );
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const l = spread(lefts);
  const r = spread(rights);
  const c = spread(centres);
  if (l <= ALIGN_TOLERANCE_PT && l <= r) return "left";
  if (r <= ALIGN_TOLERANCE_PT && r < l) return "right";
  if (c <= ALIGN_TOLERANCE_PT && c < l && c < r) return "center";
  return l <= r ? "left" : "right";
}

function fillKey(fill: RGBA): string {
  return `${fill.r},${fill.g},${fill.b},${fill.a}`;
}

/** The style a set of existing cells agree on, or null when there are none. */
export function styleOfCells(cells: StyledCell[]): TableCellStyle | null {
  if (cells.length === 0) return null;
  const runs = cells.map((c) => c.run);
  const familyRun = mode(runs, (r) => nearestStandardFont(familyOf(r.fontId)));
  const fillRun = mode(runs, (r) => fillKey(r.fill));
  return {
    family: familyRun
      ? nearestStandardFont(familyOf(familyRun.fontId))
      : "Helvetica",
    fontSize: median(runs.map((r) => r.fontSize).filter((n) => n > 0)) || 11,
    fill: fillRun ? { ...fillRun.fill } : { r: 0, g: 0, b: 0, a: 255 },
    align: alignmentOf(cells),
    sourceFontId: familyRun ? familyRun.fontId : "base14:Helvetica",
  };
}

// True when the header row is set differently enough from the body to be worth
// keeping as its own style - a bold header is the common case.
export function headerDiffers(
  header: TableCellStyle | null,
  body: TableCellStyle | null,
): boolean {
  if (!header || !body) return false;
  return (
    header.sourceFontId !== body.sourceFontId ||
    Math.abs(header.fontSize - body.fontSize) > 0.5 ||
    fillKey(header.fill) !== fillKey(body.fill)
  );
}
