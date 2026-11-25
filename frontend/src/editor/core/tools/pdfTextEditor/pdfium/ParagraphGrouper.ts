import {
  RENDER_MODE_INVISIBLE,
  textLayer,
  type PageRect,
} from "@editor/tools/pdfTextEditor/types";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  SAME_BLOCK,
  sameTextLayer,
  type BlockKey,
} from "@editor/tools/pdfTextEditor/pdfium/LineGrouper";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import { median } from "@editor/tools/pdfTextEditor/util/median";
import {
  softLineStarts,
  type BreakLine,
} from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";

/** Cluster consecutive `LineGroup` representatives into "paragraphs". */
const MIN_LINE_FACTOR = 0.6;
const MAX_LINE_FACTOR = 2.0;
const MEDIAN_TOLERANCE = 0.25;
const MARGIN_INDENT_RIGHT = 12;
const MARGIN_OUTDENT_LEFT = 2;
// Two runs are "side by side" (column peers) when their baselines are within
// this fraction of a line and a horizontal gap this wide sits between them.
const COLUMN_BASELINE_FRAC = 0.6;
const COLUMN_MIN_GAP_PT = 24;
// Left-edge clustering tolerance when splitting runs into columns.
const COLUMN_LEFT_TOLERANCE = 14;
// A table cell reads as a few words; a line of running text is longer than this.
const CELL_MAX_WORDS = 3;
const CELL_MAX_CHARS = 24;

/** Each line's fonts, as the share of its letters each draws. */
type LineFonts = ReadonlyMap<TextRun, ReadonlyMap<string, number>>;
/** A document font's own face name, or null when it has none. */
type FaceOf = (fontId: string) => string | null;

export interface ParagraphInfo {
  representative: TextRun;
  members: TextRun[];
}

export class ParagraphGrouper {
  /** `blockKey` must be the one LineGrouper grouped the page's lines by. */
  static apply(
    page: Page,
    blockKey: BlockKey = SAME_BLOCK,
    lineFonts: LineFonts = new Map(),
    faceOf: FaceOf = () => null,
  ): ParagraphInfo[] {
    const allLines = [...page.runs];
    const paragraphs: ParagraphInfo[] = [];
    const softStarts = new Map<ParagraphInfo, boolean[]>();

    const cells = tableCells(allLines);
    const scannedPairs = scannedLabelValueCells(allLines);
    // Columns first: a reading-order sort across the whole page interleaves
    // side-by-side columns into one bogus paragraph.
    for (const column of segmentColumns(allLines)) {
      const sorted = column.sort((a, b) => {
        const yDiff = b.matrix.f - a.matrix.f;
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return a.bounds.x - b.bounds.x;
      });
      // Each text layer on its own: a word typed over a scanned line sits between that line and the next, and would end their paragraph.
      const grouped: ParagraphInfo[] = [];
      for (const layerOf of [0, 1, 2]) {
        const layer = sorted.filter(
          (line) => textLayer(line.renderMode) === layerOf,
        );
        if (layer.length === 0) continue;
        const from = grouped.length;
        groupColumnLines(
          layer,
          blockKey,
          grouped,
          cells,
          scannedPairs,
          page.rules,
          lineFonts,
          faceOf,
        );
        for (const para of grouped.slice(from))
          softStarts.set(para, documentSoftStarts(para.members, layer));
      }
      const order = new Map(sorted.map((line, i) => [line, i]));
      grouped.sort(
        (a, b) => order.get(a.representative)! - order.get(b.representative)!,
      );
      paragraphs.push(...grouped);
    }

    // Fold member bounds + text into the representative and drop the member
    // runs from the page so the editor sees one overlay per paragraph.
    for (const para of paragraphs) {
      para.representative.paragraphSoftStartsText = para.representative.text;
      if (para.members.length === 1) continue;
      const rep = para.representative;

      // Snapshot per-line sub-run arrays BEFORE the rep.text mutation
      // overwrites members[0]'s state.
      const memberLineTexts = para.members.map((m) => m.text);
      const slots = buildLineSlots(para.members, memberLineTexts);

      const joinedText = memberLineTexts.join("\n");
      const minX = Math.min(...para.members.map((m) => m.bounds.x));
      const maxRight = Math.max(
        ...para.members.map((m) => m.bounds.x + m.bounds.width),
      );
      const topY = Math.max(
        ...para.members.map((m) => m.bounds.y + m.bounds.height),
      );
      const bottomY = Math.min(...para.members.map((m) => m.bounds.y));
      rep.text = joinedText;
      rep.bounds = {
        x: minX,
        y: bottomY,
        width: maxRight - minX,
        height: topY - bottomY,
      };
      // Stash per-line metadata on the representative so the React layer can
      // render with the correct line-height and the edit command can emit one.
      rep.paragraphLineHeight = computeMedianLineHeight(para.members);
      rep.paragraphMemberPtrs = para.members.map((m) => m.pdfiumObjPtr);
      rep.paragraphMemberContainers = para.members.map((m) => m.containerPtr);
      rep.paragraphMemberFs = para.members.map((m) => m.matrix.f);
      // Track every leaf ptr so EditTextCommand can remove the original
      // sub-words.
      const leafPtrs: number[] = [];
      const leafContainers: number[] = [];
      for (const m of para.members) {
        const leaves =
          m.mergedFromPtrs.length > 0
            ? m.mergedFromPtrs
            : m.pdfiumObjPtr
              ? [m.pdfiumObjPtr]
              : [];
        for (const p of leaves) {
          leafPtrs.push(p);
          leafContainers.push(m.containerPtr);
        }
      }
      rep.paragraphLeafPtrs = leafPtrs;
      rep.paragraphLeafContainers = leafContainers;
      rep.paragraphLineSlots = slots;
      rep.paragraphSoftStarts = softStarts.get(para) ?? [];
      rep.paragraphSoftStartsText = joinedText;
      rep.readingOrderUnsure = para.members.some(
        (member) => member.readingOrderUnsure,
      );
    }

    page.setRuns(paragraphs.map((p) => p.representative));
    return paragraphs;
  }
}

// The column's wrap margin is the furthest right that a line starting at or
// left of the paragraph reaches: a short paragraph's own widest line is not a
// margin, so the short lines of a list or an indented block read as ended.
function documentSoftStarts(members: TextRun[], column: TextRun[]): boolean[] {
  const lines = members.map((m) => breakLine(m, m.fontSize));
  if (lines.length < 2) return [];
  const left = Math.min(...lines.map((l) => l.left));
  return softLineStarts(
    lines,
    wrapMargin(column, left, members[0].fontSize || 12),
  );
}

function breakLine(run: TextRun, fontSize: number): BreakLine {
  return {
    text: run.text,
    left: run.bounds.x,
    right: run.bounds.x + run.bounds.width,
    fontSize,
  };
}

/** The furthest right a line of `column` starting at or left of `left` reaches. */
function wrapMargin(
  column: readonly TextRun[],
  left: number,
  fontSize: number,
): number {
  const tolerance = Math.max(3, fontSize * 0.6);
  return Math.max(
    ...column
      .filter((line) => line.bounds.x <= left + tolerance)
      .map((line) => line.bounds.x + line.bounds.width),
  );
}

/** Build a `ParagraphLineSlot[]` from the paragraph's member runs. */
export function buildLineSlots(
  members: TextRun[],
  lineTexts: string[],
): ParagraphLineSlot[] {
  const slots: ParagraphLineSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const text = lineTexts[i];
    const len = text.length;
    // A line that LineGrouper merged from several source objects already has
    // per-sub-run arrays.
    const hasSubRuns = m.mergedFromPtrs.length > 0;
    const mergedFromPtrs = hasSubRuns
      ? [...m.mergedFromPtrs]
      : m.pdfiumObjPtr
        ? [m.pdfiumObjPtr]
        : [];
    const mergedFromTexts = hasSubRuns ? [...m.mergedFromTexts] : [text];
    const mergedFromBounds = hasSubRuns
      ? m.mergedFromBounds.map((b) => ({ ...b }))
      : [{ x: m.bounds.x, right: m.bounds.x + m.bounds.width }];
    const mergedFromCharStarts = hasSubRuns ? [...m.mergedFromCharStarts] : [0];
    slots.push({
      startChar: cursor,
      endChar: cursor + len,
      baselineY: m.matrix.f,
      matrixE: m.matrix.e,
      containerPtr: m.containerPtr,
      fontId: m.fontId,
      fontSize: m.fontSize,
      fontSubset: m.fontSubset,
      mergedFromPtrs,
      mergedFromTexts,
      mergedFromBounds,
      mergedFromCharStarts,
    });
    // +1 for the synthesised "\n" between lines (no separator after the
    // last line).
    cursor += len + (i < members.length - 1 ? 1 : 0);
  }
  return slots;
}

/** One visual line's worth of slot source. */
export interface LineSlotDescriptor {
  text: string;
  baselineY: number;
  matrixE: number;
  containerPtr: number;
  fontId: string;
  fontSize: number;
  fontSubset: boolean;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  mergedFromCharStarts: number[];
}

// Same cursor walk as `buildLineSlots` but pulls each line's `mergedFrom*`
// directly from a descriptor instead of a TextRun.
export function buildLineSlotsFromDescriptors(
  descs: LineSlotDescriptor[],
): ParagraphLineSlot[] {
  const slots: ParagraphLineSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < descs.length; i++) {
    const d = descs[i];
    const len = d.text.length;
    slots.push({
      startChar: cursor,
      endChar: cursor + len,
      baselineY: d.baselineY,
      matrixE: d.matrixE,
      containerPtr: d.containerPtr,
      fontId: d.fontId,
      fontSize: d.fontSize,
      fontSubset: d.fontSubset,
      mergedFromPtrs: [...d.mergedFromPtrs],
      mergedFromTexts: [...d.mergedFromTexts],
      mergedFromBounds: d.mergedFromBounds.map((b) => ({ ...b })),
      mergedFromCharStarts: [...d.mergedFromCharStarts],
    });
    cursor += len + (i < descs.length - 1 ? 1 : 0);
  }
  return slots;
}

// A run's visual font identity for grouping: family + rounded size.
// `run.fontId` is `pdf:<fontHandlePtr>:<family>`.
// A face's own name tells regular from bold where a name-table family does not.
function fontKey(fontId: string, fontSize: number, faceOf: FaceOf): string {
  const face = faceOf(fontId) ?? fontId.slice(fontId.lastIndexOf(":") + 1);
  return `${face}@${Math.round(fontSize)}`;
}

// Typed words drawn in a fallback can outnumber a line's own letters; the line still belongs with a neighbour whose font draws a good share of both.
const SHARED_FONT_MIN_SHARE = 0.25;

function lineFontKeys(
  run: TextRun,
  lineFonts: LineFonts,
  faceOf: FaceOf,
): Set<string> {
  const shares = lineFonts.get(run);
  if (!shares || shares.size === 0)
    return new Set([fontKey(run.fontId, run.fontSize, faceOf)]);
  const most = Math.max(...shares.values());
  return new Set(
    [...shares]
      .filter(([, share]) => share >= SHARED_FONT_MIN_SHARE || share === most)
      .map(([fontId]) => fontKey(fontId, run.fontSize, faceOf)),
  );
}

// OCR estimates each line's height from its own letters, so the lines of one paragraph come out up to a fifth apart (10 next to 12).
const OCR_SIZE_RATIO = 1.3;
// A scan fed in a couple of degrees off square still reads as upright lines.
const OCR_UPRIGHT_SLOPE = 0.05;

// A turned scan's words come out as runs of their own, which this vertical-stacking grouper must not join.
function isUprightOcr(run: TextRun): boolean {
  const { a, b } = run.matrix;
  return (
    run.renderMode === RENDER_MODE_INVISIBLE &&
    a > 0 &&
    Math.abs(b) <= OCR_UPRIGHT_SLOPE * a
  );
}

// OCR stretches each word sideways to fit the scan, and a run's size carries its first word's stretch, so one line of an address reads half the size of the next. The upright scale is not stretched.
function ocrHeight(run: TextRun): number {
  const { a, b, c, d } = run.matrix;
  const across = Math.hypot(a, b);
  return across > 0 ? (run.fontSize / across) * Math.hypot(c, d) : 0;
}

// A line's own width tells its size where the OCR height does not: renderers set that height anywhere from 0.7 to 1 of the letters' size.
const OCR_AVERAGE_ADVANCE_EM = 0.5;
const OCR_MIN_MEASURED_CHARS = 4;

function ocrLineSize(run: TextRun): number {
  const line = run.text.split("\n")[0].trim();
  const measured =
    line.length >= OCR_MIN_MEASURED_CHARS
      ? run.bounds.width / (line.length * OCR_AVERAGE_ADVANCE_EM)
      : 0;
  return Math.max(ocrHeight(run), measured);
}

function sameOcrSize(a: TextRun, b: TextRun): boolean {
  const big = Math.max(ocrHeight(a), ocrHeight(b));
  const small = Math.min(ocrHeight(a), ocrHeight(b));
  return small > 0 && big / small <= OCR_SIZE_RATIO;
}

// Small scanned text set with a web page's loose leading sits further apart than its size allows, but a line that ran to the column's margin and carries on mid-sentence below is a wrapped paragraph whatever the leading.
const OCR_WRAPPED_LINE_FACTOR = 2.6;
const STARTS_MID_SENTENCE = /^\s*\p{Ll}/u;

function continuesWrappedLine(
  prev: TextRun,
  line: TextRun,
  column: readonly TextRun[],
  size: number,
): boolean {
  if (!STARTS_MID_SENTENCE.test(line.text)) return false;
  return softLineStarts(
    [breakLine(prev, size), breakLine(line, size)],
    wrapMargin(column, prev.bounds.x, size),
  )[1];
}

function shareAFont(
  a: TextRun,
  b: TextRun,
  lineFonts: LineFonts,
  faceOf: FaceOf,
): boolean {
  if (isUprightOcr(a) && isUprightOcr(b))
    return sameOcrSize(a, b) && shareAFace(a, b, lineFonts, faceOf);
  const theirs = lineFontKeys(b, lineFonts, faceOf);
  return [...lineFontKeys(a, lineFonts, faceOf)].some((key) => theirs.has(key));
}

function shareAFace(
  a: TextRun,
  b: TextRun,
  lineFonts: LineFonts,
  faceOf: FaceOf,
): boolean {
  const faceOnly = (key: string) => key.slice(0, key.lastIndexOf("@"));
  const theirs = new Set([...lineFontKeys(b, lineFonts, faceOf)].map(faceOnly));
  return [...lineFontKeys(a, lineFonts, faceOf)].some((key) =>
    theirs.has(faceOnly(key)),
  );
}

/** Split a page's line-runs into columns. */
function segmentColumns(lines: TextRun[]): TextRun[][] {
  if (lines.length < 4) return [lines];

  // Detect side-by-side peers.
  let sideBySide = 0;
  for (let i = 0; i < lines.length && sideBySide < 2; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const baseTol =
        COLUMN_BASELINE_FRAC * Math.min(a.fontSize, b.fontSize || a.fontSize);
      if (Math.abs(a.matrix.f - b.matrix.f) > baseTol) continue;
      const aRight = a.bounds.x + a.bounds.width;
      const bRight = b.bounds.x + b.bounds.width;
      const gap =
        a.bounds.x > b.bounds.x ? a.bounds.x - bRight : b.bounds.x - aRight;
      if (gap >= COLUMN_MIN_GAP_PT) {
        sideBySide += 1;
        break;
      }
    }
  }
  if (sideBySide < 2) return [lines];

  // Cluster left edges into column buckets.
  const edges = lines.map((l) => l.bounds.x).sort((a, b) => a - b);
  const centers: number[] = [];
  for (const e of edges) {
    const last = centers[centers.length - 1];
    if (last === undefined || e - last > COLUMN_LEFT_TOLERANCE) centers.push(e);
  }
  if (centers.length < 2) return [lines];

  const columns: TextRun[][] = centers.map(() => []);
  for (const line of lines) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(line.bounds.x - centers[i]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    columns[best].push(line);
  }
  return columns.filter((c) => c.length > 0);
}

// Sequentially group one column's already-sorted (top-to-bottom) lines into
// paragraphs, appending each paragraph to `out`.
function groupColumnLines(
  sorted: TextRun[],
  blockKey: BlockKey,
  out: ParagraphInfo[],
  cells: ReadonlySet<TextRun>,
  scannedPairs: ReadonlySet<TextRun>,
  rules: readonly PageRect[],
  lineFonts: LineFonts,
  faceOf: FaceOf,
): void {
  let current: ParagraphInfo | null = null;
  let currentDeltas: number[] = [];
  let currentLeftEdge = 0;

  for (const line of sorted) {
    if (!current) {
      current = { representative: line, members: [line] };
      out.push(current);
      currentDeltas = [];
      currentLeftEdge = line.bounds.x;
      continue;
    }
    const prev = current.members[current.members.length - 1];
    const sameFont = shareAFont(prev, line, lineFonts, faceOf);
    const sameColor =
      prev.fill.r === line.fill.r &&
      prev.fill.g === line.fill.g &&
      prev.fill.b === line.fill.b;
    const baselineDelta = prev.matrix.f - line.matrix.f;

    let lineHeightOk: boolean;
    if (currentDeltas.length === 0) {
      const scanned = isUprightOcr(prev) && isUprightOcr(line);
      const size = scanned ? ocrLineSize(line) : line.fontSize;
      const maxFactor =
        scanned && continuesWrappedLine(prev, line, sorted, size)
          ? OCR_WRAPPED_LINE_FACTOR
          : MAX_LINE_FACTOR;
      lineHeightOk =
        baselineDelta >= MIN_LINE_FACTOR * size &&
        baselineDelta <= maxFactor * size;
    } else {
      const med = median(currentDeltas);
      const tol = MEDIAN_TOLERANCE * med;
      lineHeightOk = baselineDelta >= med - tol && baselineDelta <= med + tol;
    }

    const deltaFromLeft = line.bounds.x - currentLeftEdge;
    const leftOk =
      deltaFromLeft >= -MARGIN_OUTDENT_LEFT &&
      deltaFromLeft <= MARGIN_INDENT_RIGHT;

    const sameBlock = blockKey(prev) === blockKey(line);
    // Stacked cells of a table are rows, each its own box, not one paragraph per column.
    const tableRows =
      (cells.has(prev) && cells.has(line)) ||
      (scannedPairs.has(line) &&
        current.members.every((member) => scannedPairs.has(member))) ||
      (isUprightOcr(prev) &&
        isUprightOcr(line) &&
        ruledApart(prev, line, rules));

    if (
      sameFont &&
      sameColor &&
      lineHeightOk &&
      leftOk &&
      sameBlock &&
      !tableRows &&
      sameTextLayer(prev, line)
    ) {
      current.members.push(line);
      currentDeltas.push(baselineDelta);
      if (line.bounds.x < currentLeftEdge) currentLeftEdge = line.bounds.x;
    } else {
      current = { representative: line, members: [line] };
      out.push(current);
      currentDeltas = [];
      currentLeftEdge = line.bounds.x;
    }
  }
}

// A scanned table's borders are drawn, not read: a rule across both lines in the gap between them is a row border.
function ruledApart(
  above: TextRun,
  below: TextRun,
  rules: readonly PageRect[],
): boolean {
  const top = below.bounds.y + below.bounds.height;
  const bottom = above.bounds.y;
  const from = Math.max(above.bounds.x, below.bounds.x);
  const to = Math.min(
    above.bounds.x + above.bounds.width,
    below.bounds.x + below.bounds.width,
  );
  return rules.some((rule) => {
    const y = rule.y + rule.height / 2;
    return (
      rule.width > rule.height &&
      y > top &&
      y < bottom &&
      rule.x <= from &&
      rule.x + rule.width >= to
    );
  });
}

function isShortCell(line: TextRun): boolean {
  const text = line.text.trim();
  return (
    text.length > 0 &&
    text.length <= CELL_MAX_CHARS &&
    text.split(/\s+/).length <= CELL_MAX_WORDS
  );
}

// Short lines side by side on one baseline, three or more of them or one a number: the cells of a table row. Two short lines alone could be narrow columns of running text.
function tableCells(lines: readonly TextRun[]): Set<TextRun> {
  const cells = new Set<TextRun>();
  for (const row of shortRows(lines))
    if (row.length >= 3 || (row.length >= 2 && row.some(isNumberCell)))
      for (const cell of row) cells.add(cell);
  return cells;
}

// On a scan, two short lines on one baseline are more often a form's label and its value than narrow columns. They are cells only where every line above them in their block is one too: an address and a footer set side by side end in short lines of their own.
function scannedLabelValueCells(lines: readonly TextRun[]): Set<TextRun> {
  const cells = new Set<TextRun>();
  for (const row of shortRows(lines))
    if (row.length === 2 && row.every(isUprightOcr))
      for (const cell of row) cells.add(cell);
  return cells;
}

// Short lines grouped by baseline, keeping those set at least a column gap from another on theirs.
function shortRows(lines: readonly TextRun[]): TextRun[][] {
  const short = lines
    .filter(isShortCell)
    .sort((a, b) => b.matrix.f - a.matrix.f);
  const rows: TextRun[][] = [];
  for (let i = 0; i < short.length;) {
    const row = [short[i]];
    let j = i + 1;
    while (
      j < short.length &&
      short[i].matrix.f - short[j].matrix.f <=
        COLUMN_BASELINE_FRAC * Math.min(short[i].fontSize, short[j].fontSize)
    )
      row.push(short[j++]);
    i = j;
    rows.push(
      row.filter((cell) =>
        row.some(
          (other) =>
            other !== cell &&
            Math.abs(other.bounds.x - cell.bounds.x) >= COLUMN_MIN_GAP_PT,
        ),
      ),
    );
  }
  return rows;
}

function isNumberCell(line: TextRun): boolean {
  return /^[-+(]?[$€£¥]?\d[\d.,\s%]*\)?$/.test(line.text.trim());
}

function computeMedianLineHeight(members: TextRun[]): number {
  if (members.length < 2) return members[0].fontSize * 1.2;
  return medianLineHeightFromBaselines(
    members.map((m) => m.matrix.f),
    members[0].fontSize,
  );
}

// Median of consecutive baseline deltas; falls back to 1.2em when there is
// fewer than one delta.
export function medianLineHeightFromBaselines(
  baselines: number[],
  fallbackFontSize: number,
): number {
  if (baselines.length < 2) return fallbackFontSize * 1.2;
  const deltas: number[] = [];
  for (let i = 1; i < baselines.length; i++) {
    deltas.push(baselines[i - 1] - baselines[i]);
  }
  return median(deltas);
}
