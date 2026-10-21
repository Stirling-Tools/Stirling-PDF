/**
 * Snapping for measurement points, in page space (PDF points, y down).
 * Thresholds are screen pixels and scaled by `pxToPage`, so snapping feels the
 * same at every zoom.
 *
 * Order, first match wins: an existing vertex; the 45-degree rays from the
 * previous point (then aligning along that ray with other vertices); x/y
 * alignment with other vertices; diagonal alignment; an existing edge.
 */
import type { Measurement, PagePoint } from "@app/utils/measurementTypes";

export interface SnapGuide {
  from: PagePoint;
  to: PagePoint;
  kind: "align" | "angle";
}

export interface SnapResult {
  point: PagePoint;
  guides: SnapGuide[];
  /** The existing vertex the point landed on, if any. */
  vertex: PagePoint | null;
}

export interface SnapOptions {
  /** The previous point of the shape being drawn, for angle snapping. */
  anchor: PagePoint | null;
  vertices: PagePoint[];
  edges: [PagePoint, PagePoint][];
  /** Page units per screen pixel: 1 / zoom. */
  pxToPage: number;
  snapToPoints: boolean;
  snapToAngles: boolean;
  /** Always lock to the nearest 45-degree ray, however far off it the pointer is. */
  forceAngle: boolean;
}

const VERTEX_PX = 10;
const ALIGN_PX = 6;
const ANGLE_PX = 8;
const EDGE_PX = 8;
const DIAGONALS = [
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

/** Every segment of a measurement, including an area's closing edge. */
export function measurementEdges(
  measurement: Pick<Measurement, "kind" | "points">,
): [PagePoint, PagePoint][] {
  const { points } = measurement;
  const edges: [PagePoint, PagePoint][] = [];
  for (let i = 1; i < points.length; i++) {
    edges.push([points[i - 1], points[i]]);
  }
  if (measurement.kind === "area" && points.length > 2) {
    edges.push([points[points.length - 1], points[0]]);
  }
  return edges;
}

function at(pageIndex: number, x: number, y: number): PagePoint {
  return { pageIndex, x, y };
}

function nearestVertex(
  raw: PagePoint,
  vertices: PagePoint[],
  threshold: number,
): PagePoint | null {
  let best: PagePoint | null = null;
  let bestDistance = threshold;
  for (const v of vertices) {
    const d = Math.hypot(v.x - raw.x, v.y - raw.y);
    if (d <= bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  return best;
}

/** Nearest of the eight 45-degree rays from `anchor`, as a unit vector. */
function nearestRay(anchor: PagePoint, raw: PagePoint) {
  const step = Math.PI / 4;
  const angle =
    Math.round(Math.atan2(raw.y - anchor.y, raw.x - anchor.x) / step) * step;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function snapOnRay(
  raw: PagePoint,
  options: SnapOptions,
  vertices: PagePoint[],
): SnapResult | null {
  const { anchor, pxToPage } = options;
  if (!anchor || anchor.pageIndex !== raw.pageIndex) return null;
  if (!options.forceAngle && !options.snapToAngles) return null;

  const ray = nearestRay(anchor, raw);
  const along = (raw.x - anchor.x) * ray.x + (raw.y - anchor.y) * ray.y;
  const onRay = at(
    raw.pageIndex,
    anchor.x + ray.x * along,
    anchor.y + ray.y * along,
  );
  const offRay = Math.hypot(raw.x - onRay.x, raw.y - onRay.y);
  if (!options.forceAngle && offRay > ANGLE_PX * pxToPage) return null;

  // Slide along the ray to line up with another vertex's x or y.
  let best: { t: number; vertex: PagePoint } | null = null;
  if (options.snapToPoints) {
    let bestShift = ALIGN_PX * pxToPage;
    for (const v of vertices) {
      if (v.x === anchor.x && v.y === anchor.y) continue;
      const hits: number[] = [];
      if (Math.abs(ray.x) > 1e-9) hits.push((v.x - anchor.x) / ray.x);
      if (Math.abs(ray.y) > 1e-9) hits.push((v.y - anchor.y) / ray.y);
      for (const t of hits) {
        const shift = Math.abs(t - along);
        if (t > 0 && shift <= bestShift) {
          best = { t, vertex: v };
          bestShift = shift;
        }
      }
    }
  }

  const point = best
    ? at(raw.pageIndex, anchor.x + ray.x * best.t, anchor.y + ray.y * best.t)
    : onRay;
  const guides: SnapGuide[] = [{ from: anchor, to: point, kind: "angle" }];
  if (best) guides.push({ from: best.vertex, to: point, kind: "align" });
  return { point, guides, vertex: null };
}

function snapToAlignment(
  raw: PagePoint,
  vertices: PagePoint[],
  pxToPage: number,
): SnapResult | null {
  const threshold = ALIGN_PX * pxToPage;
  let alignX: PagePoint | null = null;
  let alignY: PagePoint | null = null;
  let bestDx = threshold;
  let bestDy = threshold;
  for (const v of vertices) {
    const dx = Math.abs(v.x - raw.x);
    const dy = Math.abs(v.y - raw.y);
    if (dx <= bestDx) {
      alignX = v;
      bestDx = dx;
    }
    if (dy <= bestDy) {
      alignY = v;
      bestDy = dy;
    }
  }

  if (alignX || alignY) {
    const point = at(raw.pageIndex, alignX?.x ?? raw.x, alignY?.y ?? raw.y);
    const guides: SnapGuide[] = [];
    if (alignX) guides.push({ from: alignX, to: point, kind: "align" });
    if (alignY) guides.push({ from: alignY, to: point, kind: "align" });
    return { point, guides, vertex: null };
  }

  let diagonal: { point: PagePoint; vertex: PagePoint } | null = null;
  let bestOff = threshold;
  for (const v of vertices) {
    for (const d of DIAGONALS) {
      const along = (raw.x - v.x) * d.x + (raw.y - v.y) * d.y;
      const projected = at(raw.pageIndex, v.x + d.x * along, v.y + d.y * along);
      const off = Math.hypot(raw.x - projected.x, raw.y - projected.y);
      if (off <= bestOff && Math.abs(along) > threshold) {
        diagonal = { point: projected, vertex: v };
        bestOff = off;
      }
    }
  }
  return diagonal
    ? {
        point: diagonal.point,
        guides: [{ from: diagonal.vertex, to: diagonal.point, kind: "align" }],
        vertex: null,
      }
    : null;
}

function snapToEdge(
  raw: PagePoint,
  edges: [PagePoint, PagePoint][],
  pxToPage: number,
): PagePoint | null {
  let best: PagePoint | null = null;
  let bestDistance = EDGE_PX * pxToPage;
  for (const [a, b] of edges) {
    if (a.pageIndex !== raw.pageIndex) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / lengthSq),
          );
    const nearest = at(raw.pageIndex, a.x + t * dx, a.y + t * dy);
    const d = Math.hypot(nearest.x - raw.x, nearest.y - raw.y);
    if (d <= bestDistance) {
      best = nearest;
      bestDistance = d;
    }
  }
  return best;
}

export function snapPoint(raw: PagePoint, options: SnapOptions): SnapResult {
  const vertices = options.vertices.filter(
    (v) => v.pageIndex === raw.pageIndex,
  );
  const { pxToPage } = options;

  if (options.snapToPoints && !options.forceAngle) {
    const vertex = nearestVertex(raw, vertices, VERTEX_PX * pxToPage);
    if (vertex) {
      return {
        point: at(raw.pageIndex, vertex.x, vertex.y),
        guides: [],
        vertex,
      };
    }
  }

  const onRay = snapOnRay(raw, options, vertices);
  if (onRay) return onRay;

  if (options.snapToPoints) {
    const aligned = snapToAlignment(raw, vertices, pxToPage);
    if (aligned) return aligned;
    const onEdge = snapToEdge(raw, options.edges, pxToPage);
    if (onEdge) return { point: onEdge, guides: [], vertex: null };
  }

  return { point: raw, guides: [], vertex: null };
}
