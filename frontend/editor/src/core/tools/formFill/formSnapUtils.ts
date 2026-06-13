/**
 * Lightweight alignment snapping for the form field editor.
 *
 * Everything here works in page pixel space (top-left origin), the same space
 * the creation/edit overlays operate in. A dragged rectangle's edges and centre
 * snap to the edges and centres of the other fields on the page when they come
 * within a small threshold, and the matched lines are returned as guides for
 * visual feedback.
 */
import type { PixelRect } from "@app/tools/formFill/formCoordinateUtils";

export const DEFAULT_SNAP_THRESHOLD = 6;

export interface SnapGuide {
  /** "v" = vertical line at x; "h" = horizontal line at y. */
  orientation: "v" | "h";
  /** Pixel offset of the line within the page. */
  position: number;
}

export interface SnapTargets {
  /** Candidate vertical lines (left/right/centre of other fields). */
  xs: number[];
  /** Candidate horizontal lines (top/bottom/middle of other fields). */
  ys: number[];
}

/** Build snap targets from the pixel rects of the other fields on a page. */
export function collectSnapTargets(rects: PixelRect[]): SnapTargets {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rects) {
    xs.push(r.left, r.left + r.width, r.left + r.width / 2);
    ys.push(r.top, r.top + r.height, r.top + r.height / 2);
  }
  return { xs, ys };
}

function nearest(
  value: number,
  targets: number[],
  threshold: number,
): { snapped: number; delta: number } | null {
  let best: { snapped: number; delta: number } | null = null;
  for (const t of targets) {
    const delta = t - value;
    if (
      Math.abs(delta) <= threshold &&
      (!best || Math.abs(delta) < Math.abs(best.delta))
    ) {
      best = { snapped: t, delta };
    }
  }
  return best;
}

/**
 * Snap a moving rectangle (size fixed). Returns the adjusted top-left plus the
 * guide lines that were matched.
 */
export function snapMove(
  rect: PixelRect,
  targets: SnapTargets,
  threshold = DEFAULT_SNAP_THRESHOLD,
): { left: number; top: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let { left, top } = rect;

  // X axis: try left edge, right edge, then centre.
  const xCandidates = [left, left + rect.width, left + rect.width / 2];
  let xSnap: { snapped: number; delta: number } | null = null;
  for (const c of xCandidates) {
    const hit = nearest(c, targets.xs, threshold);
    if (hit && (!xSnap || Math.abs(hit.delta) < Math.abs(xSnap.delta)))
      xSnap = hit;
  }
  if (xSnap) {
    left += xSnap.delta;
    guides.push({ orientation: "v", position: xSnap.snapped });
  }

  const yCandidates = [top, top + rect.height, top + rect.height / 2];
  let ySnap: { snapped: number; delta: number } | null = null;
  for (const c of yCandidates) {
    const hit = nearest(c, targets.ys, threshold);
    if (hit && (!ySnap || Math.abs(hit.delta) < Math.abs(ySnap.delta)))
      ySnap = hit;
  }
  if (ySnap) {
    top += ySnap.delta;
    guides.push({ orientation: "h", position: ySnap.snapped });
  }

  return { left, top, guides };
}

/**
 * Snap a rectangle being resized. `edges` flags which sides are moving; only
 * those edges snap, the opposite edges stay put.
 */
export function snapResize(
  rect: PixelRect,
  edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean },
  targets: SnapTargets,
  threshold = DEFAULT_SNAP_THRESHOLD,
): { rect: PixelRect; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let { left, top, width, height } = rect;
  const right = left + width;
  const bottom = top + height;

  if (edges.left) {
    const hit = nearest(left, targets.xs, threshold);
    if (hit) {
      left = hit.snapped;
      width = right - left;
      guides.push({ orientation: "v", position: hit.snapped });
    }
  }
  if (edges.right) {
    const hit = nearest(right, targets.xs, threshold);
    if (hit) {
      width = hit.snapped - left;
      guides.push({ orientation: "v", position: hit.snapped });
    }
  }
  if (edges.top) {
    const hit = nearest(top, targets.ys, threshold);
    if (hit) {
      top = hit.snapped;
      height = bottom - top;
      guides.push({ orientation: "h", position: hit.snapped });
    }
  }
  if (edges.bottom) {
    const hit = nearest(bottom, targets.ys, threshold);
    if (hit) {
      height = hit.snapped - top;
      guides.push({ orientation: "h", position: hit.snapped });
    }
  }

  return { rect: { left, top, width, height }, guides };
}
