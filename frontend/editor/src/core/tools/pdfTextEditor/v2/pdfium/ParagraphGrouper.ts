import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

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
 *   3. Vertical gap (baseline delta) is between 0.6 and 1.8 of the
 *      font size - typical line-height range.
 *   4. Left margin matches within ±5 PDF points.
 *
 * Output: each input run becomes the representative of a paragraph;
 * lines that joined it are removed from `page.runs` but their bounds
 * are folded into the representative's `bounds` and the representative
 * gains a `lineHeight` / `paragraphMemberPtrs` snapshot the editor uses
 * for multi-line rendering and edit-time line reflow.
 */
const MIN_LINE_FACTOR = 0.6;
const MAX_LINE_FACTOR = 1.8;
const MAX_LEFT_MARGIN_DELTA = 5;

export interface ParagraphInfo {
  representative: TextRun;
  members: TextRun[];
}

export class ParagraphGrouper {
  static apply(page: Page): ParagraphInfo[] {
    const lines = [...page.runs].sort((a, b) => {
      // PDF y grows up; sort top-to-bottom (descending y).
      const yDiff = b.matrix.f - a.matrix.f;
      if (Math.abs(yDiff) > 0.5) return yDiff;
      return a.bounds.x - b.bounds.x;
    });

    const paragraphs: ParagraphInfo[] = [];
    let current: ParagraphInfo | null = null;

    for (const line of lines) {
      if (!current) {
        current = { representative: line, members: [line] };
        paragraphs.push(current);
        continue;
      }
      const prev = current.members[current.members.length - 1];
      const sameFont = prev.fontId === line.fontId;
      const sameColor =
        prev.fill.r === line.fill.r &&
        prev.fill.g === line.fill.g &&
        prev.fill.b === line.fill.b;
      const baselineDelta = prev.matrix.f - line.matrix.f;
      const lineHeightRange =
        baselineDelta >= MIN_LINE_FACTOR * line.fontSize &&
        baselineDelta <= MAX_LINE_FACTOR * line.fontSize;
      const leftAligned =
        Math.abs(line.bounds.x - prev.bounds.x) <= MAX_LEFT_MARGIN_DELTA;

      if (sameFont && sameColor && lineHeightRange && leftAligned) {
        current.members.push(line);
      } else {
        current = { representative: line, members: [line] };
        paragraphs.push(current);
      }
    }

    // Fold member bounds + text into the representative and drop the
    // member runs from the page so the editor sees one overlay per
    // paragraph.
    for (const para of paragraphs) {
      if (para.members.length === 1) continue;
      const rep = para.representative;
      const joinedText = para.members.map((m) => m.text).join("\n");
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
      rep.paragraphLineHeight = computeAverageLineHeight(para.members);
      rep.paragraphMemberPtrs = para.members.map((m) => m.pdfiumObjPtr);
      rep.paragraphMemberContainers = para.members.map((m) => m.containerPtr);
      rep.paragraphMemberFs = para.members.map((m) => m.matrix.f);
    }

    page.setRuns(paragraphs.map((p) => p.representative));
    return paragraphs;
  }
}

function computeAverageLineHeight(members: TextRun[]): number {
  if (members.length < 2) return members[0].fontSize * 1.2;
  let total = 0;
  for (let i = 1; i < members.length; i++) {
    total += members[i - 1].matrix.f - members[i].matrix.f;
  }
  return total / (members.length - 1);
}
