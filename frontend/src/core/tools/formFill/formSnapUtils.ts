/**
 * Snap-to-edge utilities for form field alignment.
 *
 * During drag (move/resize/create), candidate edges are compared to edges of
 * all OTHER fields on the same page. If a candidate is within SNAP_THRESHOLD_PX
 * pixels of a target edge, it snaps to that edge.
 */
import type { FormField, ModifyFieldDefinition } from '@app/tools/formFill/types';
import { pdfToCssRect } from '@app/tools/formFill/formCoordinateUtils';

const SNAP_THRESHOLD_PX = 6;

export type SnapAxis = 'x' | 'y';

export interface SnapResult {
  value: number;
  didSnap: boolean;
}

export interface SnapGuide {
  axis: SnapAxis;
  /** Position in pixels along the snapped axis */
  position: number;
}

interface FieldEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * Collect pixel-space edges for all fields on the given page, excluding a
 * specific field (the one being dragged).
 */
export function collectSnapTargets(
  allFields: FormField[],
  excludeFieldName: string | null,
  pageIndex: number,
  scaleX: number,
  scaleY: number,
  pageHeightPts: number,
  modifiedFields: Map<string, Partial<ModifyFieldDefinition>>,
): FieldEdges[] {
  const edges: FieldEdges[] = [];

  for (const field of allFields) {
    if (field.name === excludeFieldName) continue;
    const widgets = (field.widgets || []).filter(w => w.pageIndex === pageIndex);
    if (widgets.length === 0) continue;
    const widget = widgets[0];

    const modified = modifiedFields.get(field.name);
    let left: number, top: number, width: number, height: number;

    if (modified && modified.x != null && modified.y != null && modified.width != null && modified.height != null) {
      const css = pdfToCssRect(
        { x: modified.x, y: modified.y, width: modified.width, height: modified.height },
        pageHeightPts
      );
      left = css.x * scaleX;
      top = css.y * scaleY;
      width = css.width * scaleX;
      height = css.height * scaleY;
    } else {
      left = widget.x * scaleX;
      top = widget.y * scaleY;
      width = widget.width * scaleX;
      height = widget.height * scaleY;
    }

    edges.push({
      left,
      right: left + width,
      top,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    });
  }

  return edges;
}

/**
 * Given candidate edges for pending fields (not yet part of allFields),
 * add their pixel-space edges to the targets array.
 */
export function collectPendingFieldSnapTargets(
  pendingFields: { pageIndex: number; x: number; y: number; width: number; height: number }[],
  pageIndex: number,
  scaleX: number,
  scaleY: number,
  pageHeightPts: number,
): FieldEdges[] {
  const edges: FieldEdges[] = [];

  for (const field of pendingFields) {
    if (field.pageIndex !== pageIndex) continue;
    // Pending fields are in PDF BL origin
    const cssY = pageHeightPts - field.y - field.height;
    const left = field.x * scaleX;
    const top = cssY * scaleY;
    const width = field.width * scaleX;
    const height = field.height * scaleY;

    edges.push({
      left,
      right: left + width,
      top,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    });
  }

  return edges;
}

/**
 * Try to snap a single value to the nearest target within threshold.
 */
export function applySnap(value: number, targets: number[], threshold = SNAP_THRESHOLD_PX): SnapResult {
  let best = value;
  let bestDist = threshold + 1;

  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }

  return bestDist <= threshold
    ? { value: best, didSnap: true }
    : { value, didSnap: false };
}

function collectEdgeTargets(targets: FieldEdges[]): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const t of targets) {
    x.push(t.left, t.right, t.centerX);
    y.push(t.top, t.bottom, t.centerY);
  }
  return { x, y };
}

/**
 * Snap a rectangle during **move** — shifts position, keeps dimensions fixed.
 * Snaps whichever edge/center is closest to a target.
 */
export function snapRect(
  left: number,
  top: number,
  width: number,
  height: number,
  targets: FieldEdges[],
  threshold = SNAP_THRESHOLD_PX,
): {
  left: number;
  top: number;
  guides: SnapGuide[];
} {
  const { x: xTargets, y: yTargets } = collectEdgeTargets(targets);
  const guides: SnapGuide[] = [];

  // --- X axis: pick best of left / right / centerX ---
  const sL = applySnap(left, xTargets, threshold);
  const sR = applySnap(left + width, xTargets, threshold);
  const sCx = applySnap(left + width / 2, xTargets, threshold);

  const xCandidates = [
    { offset: sL.value - left, didSnap: sL.didSnap, dist: Math.abs(sL.value - left), pos: sL.value },
    { offset: sR.value - (left + width), didSnap: sR.didSnap, dist: Math.abs(sR.value - (left + width)), pos: sR.value },
    { offset: sCx.value - (left + width / 2), didSnap: sCx.didSnap, dist: Math.abs(sCx.value - (left + width / 2)), pos: sCx.value },
  ].filter(c => c.didSnap);

  let newLeft = left;
  if (xCandidates.length > 0) {
    xCandidates.sort((a, b) => a.dist - b.dist);
    newLeft = left + xCandidates[0].offset;
    guides.push({ axis: 'x', position: xCandidates[0].pos });
  }

  // --- Y axis: pick best of top / bottom / centerY ---
  const sT = applySnap(top, yTargets, threshold);
  const sB = applySnap(top + height, yTargets, threshold);
  const sCy = applySnap(top + height / 2, yTargets, threshold);

  const yCandidates = [
    { offset: sT.value - top, didSnap: sT.didSnap, dist: Math.abs(sT.value - top), pos: sT.value },
    { offset: sB.value - (top + height), didSnap: sB.didSnap, dist: Math.abs(sB.value - (top + height)), pos: sB.value },
    { offset: sCy.value - (top + height / 2), didSnap: sCy.didSnap, dist: Math.abs(sCy.value - (top + height / 2)), pos: sCy.value },
  ].filter(c => c.didSnap);

  let newTop = top;
  if (yCandidates.length > 0) {
    yCandidates.sort((a, b) => a.dist - b.dist);
    newTop = top + yCandidates[0].offset;
    guides.push({ axis: 'y', position: yCandidates[0].pos });
  }

  return { left: newLeft, top: newTop, guides };
}

/** Which edges are free to move for a given resize handle. */
export type ResizeEdges = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
};

/**
 * Snap a rectangle during **resize** — only the edges being dragged move;
 * the opposite edges stay fixed (dimensions change instead of position).
 */
export function snapRectResize(
  left: number,
  top: number,
  width: number,
  height: number,
  edges: ResizeEdges,
  targets: FieldEdges[],
  threshold = SNAP_THRESHOLD_PX,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  guides: SnapGuide[];
} {
  const { x: xTargets, y: yTargets } = collectEdgeTargets(targets);
  const guides: SnapGuide[] = [];

  let newLeft = left;
  let newWidth = width;
  let newTop = top;
  let newHeight = height;

  // --- X axis ---
  if (edges.left) {
    const s = applySnap(left, xTargets, threshold);
    if (s.didSnap) {
      const delta = s.value - left;
      newLeft = s.value;
      newWidth = width - delta;
      guides.push({ axis: 'x', position: s.value });
    }
  }
  if (edges.right) {
    const right = left + width;
    const s = applySnap(right, xTargets, threshold);
    if (s.didSnap) {
      newWidth = s.value - newLeft;
      guides.push({ axis: 'x', position: s.value });
    }
  }

  // --- Y axis ---
  if (edges.top) {
    const s = applySnap(top, yTargets, threshold);
    if (s.didSnap) {
      const delta = s.value - top;
      newTop = s.value;
      newHeight = height - delta;
      guides.push({ axis: 'y', position: s.value });
    }
  }
  if (edges.bottom) {
    const bottom = top + height;
    const s = applySnap(bottom, yTargets, threshold);
    if (s.didSnap) {
      newHeight = s.value - newTop;
      guides.push({ axis: 'y', position: s.value });
    }
  }

  return { left: newLeft, top: newTop, width: newWidth, height: newHeight, guides };
}
