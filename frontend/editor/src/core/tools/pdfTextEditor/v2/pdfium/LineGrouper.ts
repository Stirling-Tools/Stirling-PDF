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
// Two runs on the same baseline join the same line only when the
// horizontal gap between them is below this absolute cap. Catches
// column gutters that would otherwise merge across the column break.
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
      // The relative factor matched typical inter-word spacing but
      // rejected gaps from our per-word save emit (where chunks land
      // ~6-10pt apart). The absolute cap still catches column gutters
      // (typically 20pt+) so dropping the relative is safe.
      const close = gap <= ABS_MAX_GAP_PT;

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
      // Snapshot per-member texts and bounds BEFORE we mutate the
      // representative - the representative IS members[0], so any later
      // mutation to rep.text/bounds would overwrite member[0]'s
      // original values via shared reference.
      const memberTexts = group.members.map((m) => m.text);
      const memberBounds = group.members.map((m) => ({
        x: m.bounds.x,
        right: m.bounds.x + m.bounds.width,
      }));
      // When the typesetter emitted a cursor jump instead of a literal
      // space character, the two runs end up with content like ["Hello",
      // "World"] separated by a positional gap. Re-insert a space when
      // the previous run's text didn't already end in whitespace and
      // the next run's text doesn't already start with one.
      const parts: string[] = [memberTexts[0]];
      for (let i = 1; i < group.members.length; i++) {
        const prev = group.members[i - 1];
        const cur = group.members[i];
        const gap = cur.bounds.x - (prev.bounds.x + prev.bounds.width);
        const prevTail = memberTexts[i - 1].slice(-1);
        const curHead = memberTexts[i].slice(0, 1);
        // Typographic space advance is ~0.28*fontSize for Helvetica, but
        // PDFium-reported bounds.x is the leftmost glyph edge (after side
        // bearings) so the visible gap runs wider. 0.4 calibrates so a
        // 2-space typed gap reads back as 2 spaces after the round trip.
        const spaceWidth = 0.4 * Math.max(prev.fontSize, 4);
        const extraSpaces =
          gap > 0.2 * Math.max(prev.fontSize, 4)
            ? Math.max(1, Math.round(gap / Math.max(1, spaceWidth)))
            : 0;
        const prevEndsInSpace = /\s/.test(prevTail);
        const curStartsWithSpace = /\s/.test(curHead);
        const alreadyHave = (prevEndsInSpace ? 1 : 0) + (curStartsWithSpace ? 1 : 0);
        const toInsert = Math.max(0, extraSpaces - alreadyHave);
        if (toInsert > 0) parts.push(" ".repeat(toInsert));
        parts.push(memberTexts[i]);
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
      // Per-sub-run texts + bounds so EditTextCommand's pure-deletion
      // optimization can map joined-text chars back to their source
      // sub-objects. Use the snapshots captured at the top of the loop -
      // m.text would now read the joined string for member[0].
      group.representative.mergedFromTexts = memberTexts;
      group.representative.mergedFromBounds = memberBounds;
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
