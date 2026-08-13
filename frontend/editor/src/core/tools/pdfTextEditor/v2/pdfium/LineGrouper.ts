import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";

/** Cluster adjacent text runs on a page into "line groups". */
export interface LineGroupInfo {
  /** The merged "virtual" run shown in the overlay. */
  representative: TextRun;
  /** Original runs collapsed into this group, in left-to-right order. */
  members: TextRun[];
}

const BASELINE_TOLERANCE = 0.4;
// Two runs on the same baseline join the same line only when the horizontal gap
// between them is below this absolute cap.
const ABS_MAX_GAP_PT = 12;

// True when a same-baseline cluster's glyphs overlap so heavily that it can't
// be normal running text.
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

// A run that is just a list bullet (and a narrow glyph).
const BULLET_GLYPHS = /^[\s]*[•·∙▪●○◦‣⁃・‧°]+[\s]*$/;
function isBulletLead(run: TextRun): boolean {
  return BULLET_GLYPHS.test(run.text) && run.bounds.width <= run.fontSize;
}

// Sort one container's runs top-to-bottom / left-to-right and merge
// same-baseline, close-together runs into line groups.
function groupPartitionIntoLines(runs: TextRun[], out: LineGroupInfo[]): void {
  const sorted = [...runs].sort((a, b) => {
    const yDiff = b.matrix.f - a.matrix.f;
    // Same-line band scaled to font size so a list bullet sitting a couple of
    // points above its item still x-sorts onto the item's line.
    const band =
      BASELINE_TOLERANCE * Math.max(Math.min(a.fontSize, b.fontSize), 4);
    if (Math.abs(yDiff) > Math.max(1, band)) return yDiff;
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
    // The gap cap must scale with font size: an inter-word space in a 50pt
    // heading is ~15-25pt, which a flat 12pt cap would treat as a line break.
    const maxGap = Math.max(ABS_MAX_GAP_PT, 0.5 * Math.max(ref.fontSize, 4));
    // A leading bullet is indented from its item by more than an inter-word
    // space; let the item attach across that wider indent.
    const effMaxGap = isBulletLead(prev)
      ? Math.max(maxGap, 2 * Math.max(ref.fontSize, 4))
      : maxGap;
    // Reject joining a run that starts far to the LEFT of the previous run's
    // right edge - a right-column run must never absorb the left column.
    const minNegGap = 0.25 * Math.max(ref.fontSize, 4);
    const close = gap <= effMaxGap && gap >= -minNegGap;

    if (sameLine && close) {
      current.members.push(run);
    } else {
      current = { representative: run, members: [run] };
      out.push(current);
    }
  }
}

export class LineGrouper {
  /** Group a page's runs and store the result back onto the page. */
  static apply(page: Page): LineGroupInfo[] {
    // Partition by form-xobject container BEFORE grouping.
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

    // Refine: a "line" whose glyphs heavily OVERLAP in x is not real running
    // text.
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

    // Mutate the representative's text/bounds to reflect the merged group and
    // remember the underlying object pointers so ReplaceLineGroupCommand can.
    for (const group of groups) {
      if (group.members.length === 1) continue;
      // Snapshot per-member texts and bounds BEFORE we mutate the
      // representative.
      const memberTexts = group.members.map((m) => m.text);
      const memberBounds = group.members.map((m) => ({
        x: m.bounds.x,
        right: m.bounds.x + m.bounds.width,
      }));
      // When the typesetter emitted a cursor jump instead of a literal space
      // character, the two runs end up with content like ["Hello".
      const parts: string[] = [memberTexts[0]];
      const memberCharStarts: number[] = [0];
      let cumulativeLen = memberTexts[0].length;
      for (let i = 1; i < group.members.length; i++) {
        const prev = group.members[i - 1];
        const cur = group.members[i];
        const gap = cur.bounds.x - (prev.bounds.x + prev.bounds.width);
        const prevTail = memberTexts[i - 1].slice(-1);
        const curHead = memberTexts[i].slice(0, 1);
        // Typographic space advance is ~0.28*fontSize for Helvetica.
        const spaceWidth = 0.4 * Math.max(prev.fontSize, 4);
        const extraSpaces =
          gap > 0.2 * Math.max(prev.fontSize, 4)
            ? Math.max(1, Math.floor(gap / Math.max(1, spaceWidth) + 0.25))
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
      // optimization can map joined-text chars back to their source.
      group.representative.mergedFromTexts = memberTexts;
      group.representative.mergedFromBounds = memberBounds;
      group.representative.mergedFromCharStarts = memberCharStarts;
      group.representative.mergedFromPtrs = group.members.map(
        (m) => m.pdfiumObjPtr,
      );
    }

    // Replace the page's runs with just the representatives.
    page.setRuns(groups.map((g) => g.representative));
    return groups;
  }
}
