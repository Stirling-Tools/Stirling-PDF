/**
 * Prices typed text the way the PDF will draw it, so the overlay can lay out
 * and wrap a keystroke's letters before the page has re-rendered them.
 *
 * The table holds the PDF's advance per em for each character the run has been
 * measured with. A character missing from it is priced by `measureChar`, the
 * browser's width in the overlay's font, which can be several percent off the
 * PDF's; callers measure the run to fill the table before relying on a price.
 */
export type AdvanceTable = ReadonlyMap<string, number>;

/** The characters of `text` the table has no price for, apart from line breaks. */
export function unpricedChars(
  text: string,
  table: AdvanceTable | null,
): Set<string> {
  const missing = new Set<string>();
  for (const ch of text) {
    if (ch === "\n" || ch === "\r") continue;
    if (!table?.has(ch)) missing.add(ch);
  }
  return missing;
}

/** `base` with every price in `learned` added; a character in both keeps the learned price. */
export function mergeAdvances(
  base: AdvanceTable | null,
  learned: AdvanceTable | null,
): Map<string, number> | null {
  if (!base && !learned) return null;
  return new Map([...(base ?? []), ...(learned ?? [])]);
}

/** Width in CSS px the PDF advances the pen across `line`, ignoring trailing spaces. */
function pricedLineWidthPx(
  line: string,
  table: AdvanceTable | null,
  fontSizePx: number,
  measureChar: (ch: string) => number,
): number {
  let width = 0;
  for (const ch of line.replace(/[ \t]+$/, "")) {
    const em = table?.get(ch);
    width += em === undefined ? measureChar(ch) : em * fontSizePx;
  }
  return width;
}

/** Pen positions the engine measured for `text`, in page points. */
export interface MeasuredText {
  text: string;
  starts: readonly number[];
  ends: readonly number[];
}

/**
 * Width in CSS px of line `lineIndex` of `text`, ignoring trailing spaces:
 * from the engine's positions for as much of the line as `measured` still
 * describes, which is everything before the first character that changed,
 * and priced from the table after that.
 */
export function lineWidthPx(
  text: string,
  lineIndex: number,
  measured: MeasuredText | null,
  table: AdvanceTable | null,
  fontSizePx: number,
  pxPerPt: number,
  measureChar: (ch: string) => number,
): number {
  const lines = text.split("\n");
  const line = lines[lineIndex] ?? "";
  let lineStart = 0;
  for (let i = 0; i < lineIndex; i += 1) lineStart += lines[i].length + 1;
  const lineEnd = lineStart + line.replace(/[ \t\r]+$/, "").length;
  const price = (from: number) =>
    pricedLineWidthPx(
      text.slice(from, lineEnd),
      table,
      fontSizePx,
      measureChar,
    );
  if (!measured) return price(lineStart);
  let same = 0;
  const limit = Math.min(text.length, measured.text.length);
  while (same < limit && text[same] === measured.text[same]) same += 1;
  const known = Math.min(same, lineEnd);
  const placed = (i: number) =>
    Number.isFinite(measured.starts[i]) && Number.isFinite(measured.ends[i]);
  let left = Infinity;
  let inkRight = -Infinity;
  for (let i = lineStart; i < known; i += 1) {
    if (!placed(i)) continue;
    left = Math.min(left, measured.starts[i]);
    inkRight = Math.max(inkRight, measured.ends[i]);
  }
  if (!Number.isFinite(left)) return price(lineStart);
  // Where the pen stands after the known part: the start of whatever the
  // engine drew next on this line, or the ink's end when nothing follows.
  const penAfter =
    known < lineEnd &&
    known < measured.text.length &&
    measured.text[known] !== "\n" &&
    placed(known)
      ? measured.starts[known]
      : inkRight;
  return (penAfter - left) * pxPerPt + price(known);
}
