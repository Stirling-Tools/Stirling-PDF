// Points, scale, and page are all stored in the PDF page's own native point
// space (72pt/inch, independent of on-screen zoom) — see eventToPagePoint in
// TakeoffWorkbenchView. That keeps a calibrated scale valid across zoom
// changes: convert screen -> page space on the way in, multiply by zoom only
// when drawing back to the screen.
export interface TakeoffPoint {
  x: number;
  y: number;
}

export type TakeoffAnnotationType =
  | "length"
  | "area"
  | "count"
  | "perimeter"
  | "volume"
  | "radius"
  | "diameter"
  | "angle";

// Geometry drawn on the plan, owned by exactly one TakeoffMaterial row via
// materialId. A row can own several of these — one per drawn segment/shape/
// marker, possibly spread across several pages — and its quantity is the sum
// of all of them (see computeValue in geometry.ts). This is how e.g. one
// "Interior Partition Walls" row can be measured a run at a time across
// several floor plan pages and still total correctly.
export interface TakeoffAnnotation {
  id: string;
  materialId: string;
  type: TakeoffAnnotationType;
  page: number;
  points: TakeoffPoint[];
}

// A calibrated scale for one page: `pointsSpan` page-points on the drawing
// represent `real` `unit`s in reality.
export interface TakeoffPageScale {
  pointsSpan: number;
  real: number;
  unit: string;
  // 'auto' when read off a printed scale note (see detectScaleFromText) —
  // shown differently so the user knows to sanity-check it. Manually
  // recalibrating always overwrites this with 'manual'.
  source?: "manual" | "auto";
}

export interface TakeoffRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A rectangular region of one page calibrated to its own scale, independent
// of that page's scale — for sheets that mix a detail at a different scale
// (e.g. a 1:10 blow-up) alongside the main drawing. Any measurement whose
// point falls inside a viewport's rect uses the viewport's scale instead of
// the page's (see resolveScale in geometry.ts).
export interface TakeoffViewport {
  id: string;
  page: number;
  rect: TakeoffRect;
  scale: TakeoffPageScale;
}

// A row is both a cost line and the on-plan measurement trigger — clicking
// its Ruler/Area/Count button arms that row so the next draw on the plan
// belongs to it.
export interface TakeoffMaterial {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  // 'area' rows only: true sloped area = net flat area / cos(pitch).
  pitchDegrees?: number;
  // 'area' rows only: another area row's id whose area nets against this one
  // (e.g. door/window openings deducted from a wall).
  deductsFromMaterialId?: string;
  // 'volume' rows only: multiplies the flat footprint area by this
  // depth/height to get a volume (e.g. a concrete slab's area x its
  // thickness).
  depthValue?: number;
}
