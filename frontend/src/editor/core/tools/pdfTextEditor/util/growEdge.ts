import {
  RENDER_MODE_INVISIBLE,
  type TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import { isMostlyRtl } from "@editor/tools/pdfTextEditor/util/bidi";

// Typed text stops this many ems short of the next text on its rows.
const EDGE_GAP_EM = 0.5;
// Another box shares a row when they overlap by this share of the shorter one; the lines above and below touch only at their ascenders and descenders.
const SAME_ROW_SHARE = 0.3;
// A box starting this many ems inside the run's own already sits over it, as a superscript or an inline mark does, and is no edge to grow to.
const OVERLAP_SLACK_EM = 0.25;

/**
 * How far text typed into a run in Grow may run before it must wrap, short of
 * other text set beside it on its rows such as the next column, in PDF x.
 * Left-to-right text grows to the right and right-to-left text to the left,
 * so `side` says which way the edge lies.
 */
export interface GrowEdge {
  side: "left" | "right";
  x: number;
}

function sharesRow(run: TextRunSnapshot, other: TextRunSnapshot): boolean {
  const top = Math.min(
    run.bounds.y + run.bounds.height,
    other.bounds.y + other.bounds.height,
  );
  const bottom = Math.max(run.bounds.y, other.bounds.y);
  const shorter = Math.min(run.bounds.height, other.bounds.height);
  return shorter > 0 && top - bottom > SAME_ROW_SHARE * shorter;
}

/** The edge other text sets `run` among `runs`, or null when none stands beside it. */
export function growEdge(
  run: TextRunSnapshot,
  runs: readonly TextRunSnapshot[],
): GrowEdge | null {
  const em = Math.max(run.fontSize, 4);
  const invisible = run.renderMode === RENDER_MODE_INVISIBLE;
  const left = run.bounds.x;
  const right = run.bounds.x + run.bounds.width;
  const slack = OVERLAP_SLACK_EM * em;
  const rtl = isMostlyRtl(run.text);
  let nearest: number | null = null;
  for (const other of runs) {
    if (other.id === run.id || !other.text.trim()) continue;
    if ((other.renderMode === RENDER_MODE_INVISIBLE) !== invisible) continue;
    if (!sharesRow(run, other)) continue;
    const otherRight = other.bounds.x + other.bounds.width;
    if (rtl) {
      if (otherRight > left + slack) continue;
      if (nearest === null || otherRight > nearest) nearest = otherRight;
    } else {
      if (other.bounds.x < right - slack) continue;
      if (nearest === null || other.bounds.x < nearest)
        nearest = other.bounds.x;
    }
  }
  if (nearest === null) return null;
  const gap = EDGE_GAP_EM * em;
  return rtl
    ? { side: "left", x: nearest + gap }
    : { side: "right", x: nearest - gap };
}

/** Every run's {@link growEdge}, by run id. */
export function growEdges(
  runs: readonly TextRunSnapshot[],
): Map<string, GrowEdge> {
  const out = new Map<string, GrowEdge>();
  for (const run of runs) {
    const edge = growEdge(run, runs);
    if (edge) out.set(run.id, edge);
  }
  return out;
}
