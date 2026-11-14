import { RENDER_MODE_INVISIBLE } from "@editor/tools/pdfTextEditor/types";
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

export interface ParagraphInfo {
  representative: TextRun;
  members: TextRun[];
}

export class ParagraphGrouper {
  /** `blockKey` must be the one LineGrouper grouped the page's lines by. */
  static apply(
    page: Page,
    blockKey: BlockKey = SAME_BLOCK,
    lineFonts: ReadonlyMap<TextRun, ReadonlyMap<string, number>> = new Map(),
    faceOf: (fontId: string) => string | null = () => null,
  ): ParagraphInfo[] {
    const allLines = [...page.runs];
    const paragraphs: ParagraphInfo[] = [];

    const cells = tableCells(allLines);
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
      for (const invisible of [false, true]) {
        const layer = sorted.filter(
          (line) => (line.renderMode === RENDER_MODE_INVISIBLE) === invisible,
        );
        if (layer.length > 0)
          groupColumnLines(layer, blockKey, grouped, cells, lineFonts, faceOf);
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
    }

    page.setRuns(paragraphs.map((p) => p.representative));
    return paragraphs;
  }
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
function fontKey(
  fontId: string,
  fontSize: number,
  faceOf: (fontId: string) => string | null,
): string {
  const face = faceOf(fontId) ?? fontId.slice(fontId.lastIndexOf(":") + 1);
  return `${face}@${Math.round(fontSize)}`;
}

// Typed words drawn in a fallback can outnumber a line's own letters; the line still belongs with a neighbour whose font draws a good share of both.
const SHARED_FONT_MIN_SHARE = 0.25;

function lineFontKeys(
  run: TextRun,
  lineFonts: ReadonlyMap<TextRun, ReadonlyMap<string, number>>,
  faceOf: (fontId: string) => string | null,
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

function shareAFont(
  a: TextRun,
  b: TextRun,
  lineFonts: ReadonlyMap<TextRun, ReadonlyMap<string, number>>,
  faceOf: (fontId: string) => string | null,
): boolean {
  const theirs = lineFontKeys(b, lineFonts, faceOf);
  return [...lineFontKeys(a, lineFonts, faceOf)].some((key) => theirs.has(key));
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
  lineFonts: ReadonlyMap<TextRun, ReadonlyMap<string, number>>,
  faceOf: (fontId: string) => string | null,
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
      lineHeightOk =
        baselineDelta >= MIN_LINE_FACTOR * line.fontSize &&
        baselineDelta <= MAX_LINE_FACTOR * line.fontSize;
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
    const tableRows = cells.has(prev) && cells.has(line);

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
  const short = lines
    .filter(isShortCell)
    .sort((a, b) => b.matrix.f - a.matrix.f);
  const cells = new Set<TextRun>();
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
    const apart = row.filter((cell) =>
      row.some(
        (other) =>
          other !== cell &&
          Math.abs(other.bounds.x - cell.bounds.x) >= COLUMN_MIN_GAP_PT,
      ),
    );
    if (apart.length >= 3 || (apart.length >= 2 && apart.some(isNumberCell)))
      for (const cell of apart) cells.add(cell);
  }
  return cells;
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
