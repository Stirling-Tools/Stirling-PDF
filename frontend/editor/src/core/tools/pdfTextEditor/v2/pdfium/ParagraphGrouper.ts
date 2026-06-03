import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type {
  ParagraphLineSlot,
  TextRun,
} from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * Cluster consecutive `LineGroup` representatives (already produced by
 * `LineGrouper`) into "paragraphs" - vertically-adjacent runs that share
 * the same font, size, fill colour, and roughly the same left margin.
 *
 * The motivation: a PDF emits one text object per visual line, so a
 * five-line body paragraph appears as five separate editable overlays.
 * Editing each line independently means the user has to reflow text by
 * hand. Grouping them into one tall editable block makes the editor
 * behave like a word processor for the common case.
 *
 * Heuristic (all conditions must hold for two adjacent line groups to
 * join the same paragraph):
 *   1. Same `fontId` (typography + size match).
 *   2. Same fill colour.
 *   3. Vertical gap (baseline delta) is plausible for body text. Start
 *      with the wide bootstrap range [0.6, 2.0] of the font size for the
 *      FIRST pair; once two lines have joined, the paragraph locks onto
 *      the observed median delta and admits subsequent lines only when
 *      |delta - median| <= 0.20 * median. This catches paragraphs whose
 *      first line is followed by a slightly larger spacing (drop cap,
 *      figure rule) while still rejecting an actual paragraph break.
 *   4. Left margin matches the established paragraph left edge. The
 *      tolerance is asymmetric: up to +12 PDF points to the right of the
 *      paragraph left (allows hanging indent / first-line indent), but
 *      only -2 PDF points to the left (a noticeable outdent breaks the
 *      paragraph; minor float noise does not).
 *
 * Output: each input run becomes the representative of a paragraph;
 * lines that joined it are removed from `page.runs` but their bounds
 * are folded into the representative's `bounds` and the representative
 * gains a `lineHeight` / `paragraphMemberPtrs` snapshot the editor uses
 * for multi-line rendering and edit-time line reflow.
 */
const MIN_LINE_FACTOR = 0.6;
const MAX_LINE_FACTOR = 2.0;
const MEDIAN_TOLERANCE = 0.25;
const MARGIN_INDENT_RIGHT = 12;
const MARGIN_OUTDENT_LEFT = 2;
// Two runs are "side by side" (column peers) when their baselines are
// within this fraction of a line and a horizontal gap this wide sits
// between them. Used to detect multi-column layouts.
const COLUMN_BASELINE_FRAC = 0.6;
const COLUMN_MIN_GAP_PT = 24;
// Left-edge clustering tolerance when splitting runs into columns.
const COLUMN_LEFT_TOLERANCE = 14;

export interface ParagraphInfo {
  representative: TextRun;
  members: TextRun[];
}

export class ParagraphGrouper {
  static apply(page: Page): ParagraphInfo[] {
    const allLines = [...page.runs];
    const paragraphs: ParagraphInfo[] = [];

    // Segment into columns FIRST. A naive y-then-x sort interleaves the
    // columns of a 2-column layout (left line, right line, left line, ...)
    // which makes vertical paragraph grouping impossible - the next line
    // of a column is never adjacent in the sort order. Grouping within
    // each column fixes that. Single-column docs fall through to one
    // column, so this is a no-op for them.
    for (const column of segmentColumns(allLines)) {
      const sorted = column.sort((a, b) => {
        const yDiff = b.matrix.f - a.matrix.f;
        if (Math.abs(yDiff) > 0.5) return yDiff;
        return a.bounds.x - b.bounds.x;
      });
      groupColumnLines(sorted, paragraphs);
    }

    // Fold member bounds + text into the representative and drop the
    // member runs from the page so the editor sees one overlay per
    // paragraph.
    for (const para of paragraphs) {
      if (para.members.length === 1) continue;
      const rep = para.representative;

      // Snapshot per-line sub-run arrays BEFORE the rep.text mutation
      // overwrites members[0]'s state (rep IS members[0] by reference,
      // so any field we read off members[0] after the mutation is the
      // joined-paragraph value, not the line-level value we need for
      // partial editing).
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
      // Stash per-line metadata on the representative so the React layer
      // can render with the correct line-height and the edit command can
      // emit one text object per line on commit.
      rep.paragraphLineHeight = computeMedianLineHeight(para.members);
      rep.paragraphMemberPtrs = para.members.map((m) => m.pdfiumObjPtr);
      rep.paragraphMemberContainers = para.members.map((m) => m.containerPtr);
      rep.paragraphMemberFs = para.members.map((m) => m.matrix.f);
      // Track every leaf ptr so EditTextCommand can remove the original
      // sub-words (LineGrouper merges multiple PDFium objects into each
      // line; without this, removal misses everything except the first).
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

/**
 * Build a `ParagraphLineSlot[]` from the paragraph's member runs. Each
 * slot copies the line-level `mergedFrom*` arrays so the partial-edit
 * planner can treat the slot as a self-contained mini-TextRun. Called
 * with snapshotted line texts so mutating the rep doesn't poison
 * `members[0]`.
 */
function buildLineSlots(
  members: TextRun[],
  lineTexts: string[],
): ParagraphLineSlot[] {
  const slots: ParagraphLineSlot[] = [];
  let cursor = 0;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const text = lineTexts[i];
    const len = text.length;
    // A line that LineGrouper merged from several source objects already
    // has per-sub-run arrays. A line that is a SINGLE PDFium text object
    // (the common case for cleanly-authored PDFs) has empty mergedFrom*
    // arrays - fall back to treating the whole line as one sub-run keyed
    // on its own `pdfiumObjPtr`, so paragraph-partial editing can still
    // keep the source font instead of bailing to the overlay path.
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

/**
 * A run's visual font identity for grouping: family + rounded size.
 *
 * `run.fontId` is `pdf:<fontHandlePtr>:<family>`, and PDFium often hands
 * out a DIFFERENT font-handle pointer per text object even when the
 * objects share the same actual font - so comparing full fontIds makes
 * almost every adjacent line look like a font change and nothing groups.
 * Comparing family + size instead reflects what the user sees.
 */
function fontKey(run: TextRun): string {
  const family = run.fontId.slice(run.fontId.lastIndexOf(":") + 1);
  return `${family}@${Math.round(run.fontSize)}`;
}

/**
 * Split a page's line-runs into columns.
 *
 * Returns a single column (all lines) unless the page clearly has a
 * multi-column layout - proven by the presence of "side by side" runs
 * (two runs that share a baseline but sit apart horizontally with a wide
 * gutter between them). Gating on that evidence avoids mis-splitting
 * ordinary single-column text whose paragraphs happen to be indented.
 */
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

/**
 * Sequentially group one column's already-sorted (top-to-bottom) lines
 * into paragraphs, appending each paragraph to `out`. A line joins the
 * current paragraph when it shares the visual font, fill colour, a
 * plausible line-height (bootstrapped, then median-locked), and left
 * margin; otherwise it starts a new paragraph.
 */
function groupColumnLines(sorted: TextRun[], out: ParagraphInfo[]): void {
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
    const sameFont = fontKey(prev) === fontKey(line);
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

    if (sameFont && sameColor && lineHeightOk && leftOk) {
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function computeMedianLineHeight(members: TextRun[]): number {
  if (members.length < 2) return members[0].fontSize * 1.2;
  const deltas: number[] = [];
  for (let i = 1; i < members.length; i++) {
    deltas.push(members[i - 1].matrix.f - members[i].matrix.f);
  }
  return median(deltas);
}
