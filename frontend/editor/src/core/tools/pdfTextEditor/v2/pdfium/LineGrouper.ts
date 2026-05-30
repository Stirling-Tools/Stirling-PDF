import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

/**
 * Cluster adjacent text runs on a page into "line groups".
 *
 * PDFium emits one PDF text object per Tj/TJ operator. PDFs produced by
 * Word / LibreOffice / table generators often emit one object per
 * character or per small word, which makes single-letter overlays in our
 * editor. This grouper merges runs that share roughly the same baseline
 * AND sit close together horizontally into one virtual TextRun the user
 * can edit as a single block.
 *
 * Heuristic:
 *  - Two runs share a "line" if their baselines (matrix.f) differ by
 *    less than `baselineTolerance * referenceFontSize`.
 *  - Within a line, runs join the same group if the gap between the
 *    previous run's right edge and this run's left edge is less than
 *    `wordGapFactor * fontSize` (default 0.6 - roughly an em-space).
 *  - Each output group's representative `TextRun` carries the merged
 *    text. The list of underlying TextRun ids is stored so the editor
 *    can replace them all on edit via `ReplaceLineGroupCommand`.
 */
export interface LineGroupInfo {
  /** The merged "virtual" run shown in the overlay. */
  representative: TextRun;
  /** Original runs collapsed into this group, in left-to-right order. */
  members: TextRun[];
}

const BASELINE_TOLERANCE = 0.4;
// Two runs on the same baseline join the same line only if the
// horizontal gap between them is BOTH within `WORD_GAP_FACTOR * fontSize`
// AND below an absolute cap. The cap catches column gutters that happen
// to be a small multiple of the font size; without it, runs from the
// right column merge into left-column lines that share a baseline.
const WORD_GAP_FACTOR = 0.6;
const ABS_MAX_GAP_PT = 12;

export class LineGrouper {
  /**
   * Group a page's runs and store the result back onto the page.
   * Returns the list of LineGroup metadata for downstream commands.
   */
  static apply(page: Page): LineGroupInfo[] {
    const sorted = [...page.runs].sort((a, b) => {
      // Sort by line (descending y because PDF origin is lower-left, so
      // larger y = higher line), then by left x.
      const yDiff = b.matrix.f - a.matrix.f;
      if (Math.abs(yDiff) > 1) return yDiff;
      return a.bounds.x - b.bounds.x;
    });

    const groups: LineGroupInfo[] = [];
    let current: LineGroupInfo | null = null;

    for (const run of sorted) {
      if (!current) {
        current = { representative: run, members: [run] };
        groups.push(current);
        continue;
      }
      const ref = current.representative;
      const baseDiff = Math.abs(run.matrix.f - ref.matrix.f);
      const sameLine = baseDiff <= BASELINE_TOLERANCE * Math.max(ref.fontSize, 4);
      const prev = current.members[current.members.length - 1];
      const gap = run.bounds.x - (prev.bounds.x + prev.bounds.width);
      const close =
        gap <= WORD_GAP_FACTOR * Math.max(ref.fontSize, 4) &&
        gap <= ABS_MAX_GAP_PT;

      if (sameLine && close) {
        current.members.push(run);
      } else {
        current = { representative: run, members: [run] };
        groups.push(current);
      }
    }

    // Mutate the representative's text/bounds to reflect the merged group
    // and remember the underlying object pointers so ReplaceLineGroupCommand
    // can delete them on first edit.
    for (const group of groups) {
      if (group.members.length === 1) continue;
      // When the typesetter emitted a cursor jump instead of a literal
      // space character, the two runs end up with content like ["Hello",
      // "World"] separated by a positional gap. Re-insert a space when
      // the previous run's text didn't already end in whitespace and
      // the next run's text doesn't already start with one.
      const parts: string[] = [group.members[0].text];
      for (let i = 1; i < group.members.length; i++) {
        const prev = group.members[i - 1];
        const cur = group.members[i];
        const gap = cur.bounds.x - (prev.bounds.x + prev.bounds.width);
        const prevTail = prev.text.slice(-1);
        const curHead = cur.text.slice(0, 1);
        const needsSpace =
          gap > 0.2 * Math.max(prev.fontSize, 4) &&
          !/\s/.test(prevTail) &&
          !/\s/.test(curHead);
        if (needsSpace) parts.push(" ");
        parts.push(cur.text);
      }
      const joined = parts.join("");
      const last = group.members[group.members.length - 1];
      const left = group.representative.bounds.x;
      const right = last.bounds.x + last.bounds.width;
      group.representative.text = joined;
      group.representative.bounds = {
        ...group.representative.bounds,
        x: left,
        width: Math.max(group.representative.bounds.width, right - left),
      };
      group.representative.mergedFromPtrs = group.members.map(
        (m) => m.pdfiumObjPtr,
      );
    }

    // Replace the page's runs with just the representatives. The originals
    // remain reachable through `group.members` so commands can find them
    // by pdfium pointer.
    page.setRuns(groups.map((g) => g.representative));
    return groups;
  }
}
