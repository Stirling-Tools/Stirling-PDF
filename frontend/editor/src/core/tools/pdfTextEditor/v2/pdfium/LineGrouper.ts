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

/**
 * True when a same-baseline cluster's glyphs overlap so heavily that it
 * can't be normal running text - the x-positions barely advance (or go
 * backwards) between consecutive glyphs, the hallmark of layered /
 * stacked decorative big text (gradient fills, outline+fill passes,
 * drop shadows). Merging + x-sorting such glyphs interleaves the layers
 * into scrambled output, so the caller keeps them as individual runs.
 *
 * `members` are already x-sorted. A pair "barely advances" when the next
 * glyph starts less than 12% of the font size to the right of the
 * previous glyph's start. Normal running text advances by roughly a
 * glyph width every step (~0.2-0.7em), so it has essentially zero such
 * pairs; a layered/overlapping cluster has many. The 30% threshold
 * cleanly separates the two (stacked headings run 40-90%) while leaving
 * even tightly-kerned real text untouched.
 */
function isDecorativeOverlap(members: TextRun[]): boolean {
  if (members.length < 3) return false;
  let overlapping = 0;
  for (let i = 1; i < members.length; i++) {
    const minAdvance = 0.12 * Math.max(members[i].fontSize, 4);
    if (members[i].bounds.x - members[i - 1].bounds.x < minAdvance) {
      overlapping += 1;
    }
  }
  return overlapping / (members.length - 1) > 0.3;
}

/**
 * Sort one container's runs top-to-bottom / left-to-right and merge
 * same-baseline, close-together runs into line groups, appending each
 * group to `out`. Only ever called with runs that share a coordinate
 * space (one form xobject, or page level), so `bounds.x` is comparable.
 */
function groupPartitionIntoLines(
  runs: TextRun[],
  out: LineGroupInfo[],
): void {
  const sorted = [...runs].sort((a, b) => {
    const yDiff = b.matrix.f - a.matrix.f;
    if (Math.abs(yDiff) > 1) return yDiff;
    return a.bounds.x - b.bounds.x;
  });

  let current: LineGroupInfo | null = null;
  for (const run of sorted) {
    if (!current) {
      current = { representative: run, members: [run] };
      out.push(current);
      continue;
    }
    const ref = current.representative;
    const baseDiff = Math.abs(run.matrix.f - ref.matrix.f);
    const sameLine = baseDiff <= BASELINE_TOLERANCE * Math.max(ref.fontSize, 4);
    const prev = current.members[current.members.length - 1];
    const gap = run.bounds.x - (prev.bounds.x + prev.bounds.width);
    // The gap cap must scale with font size: an inter-word space in a
    // 50pt heading is ~15-25pt, which a flat 12pt cap would treat as a
    // line break (splitting "Open Source" into "Open" + "Source"). Allow
    // the larger of the absolute cap (for small per-word save chunks) and
    // half the font size (for large display text). Column gutters stay
    // wider than this in practice, so they still split correctly.
    const maxGap = Math.max(ABS_MAX_GAP_PT, 0.5 * Math.max(ref.fontSize, 4));
    const close = gap <= maxGap;

    if (sameLine && close) {
      current.members.push(run);
    } else {
      current = { representative: run, members: [run] };
      out.push(current);
    }
  }
}

export class LineGrouper {
  /**
   * Group a page's runs and store the result back onto the page.
   * Returns the list of LineGroup metadata for downstream commands.
   */
  static apply(page: Page): LineGroupInfo[] {
    // Partition by form-xobject container BEFORE grouping. Objects inside
    // a form xobject report their bounds in the form's LOCAL coordinate
    // space, not page space - so glyphs from three side-by-side form
    // "pills" (e.g. Open Source / Privacy First / Self-Hosted) all read
    // near the same x and, when merged + x-sorted together, interleave
    // into gibberish ("OSPrepivlefa-n Hc"). Grouping each container
    // independently keeps every form's text intact and correctly ordered.
    // Page-level objects (container 0) all share one partition and behave
    // exactly as before.
    const partitions = new Map<number, TextRun[]>();
    for (const run of page.runs) {
      const key = run.containerPtr || 0;
      const list = partitions.get(key);
      if (list) list.push(run);
      else partitions.set(key, [run]);
    }

    const groups: LineGroupInfo[] = [];
    for (const partition of partitions.values()) {
      groupPartitionIntoLines(partition, groups);
    }

    // Refine: a "line" whose glyphs heavily OVERLAP in x (consecutive
    // glyphs barely advancing, or starting at/before the previous one)
    // is not real running text - it's decorative / layered / multi-pass
    // big text (drop shadows, gradient fills, outline+fill, etc.) that a
    // typesetter stacks at near-identical positions. Merging + x-sorting
    // those interleaves the layers into scrambled gibberish
    // ("OSPrepivlefa-n Hc"). Keep such clusters as their individual
    // single-glyph runs instead so the editor never surfaces a garbled
    // merged run. Normal text advances monotonically and is untouched.
    const refined: LineGroupInfo[] = [];
    for (const group of groups) {
      if (group.members.length > 2 && isDecorativeOverlap(group.members)) {
        for (const m of group.members) {
          refined.push({ representative: m, members: [m] });
        }
      } else {
        refined.push(group);
      }
    }
    groups.length = 0;
    groups.push(...refined);

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
      const memberCharStarts: number[] = [0];
      let cumulativeLen = memberTexts[0].length;
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
        const alreadyHave =
          (prevEndsInSpace ? 1 : 0) + (curStartsWithSpace ? 1 : 0);
        const toInsert = Math.max(0, extraSpaces - alreadyHave);
        if (toInsert > 0) {
          parts.push(" ".repeat(toInsert));
          cumulativeLen += toInsert;
        }
        memberCharStarts.push(cumulativeLen);
        parts.push(memberTexts[i]);
        cumulativeLen += memberTexts[i].length;
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
      group.representative.mergedFromCharStarts = memberCharStarts;
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
