// Points, scale, and page are all stored in the PDF page's own native point
// space (72pt/inch, independent of on-screen zoom) — see eventToPagePoint in
// TakeoffWorkbenchView. That keeps a calibrated scale valid across zoom
// changes: convert screen -> page space on the way in, multiply by zoom only
// when drawing back to the screen.
export interface TakeoffPoint {
  x: number;
  y: number;
}

export type TakeoffAnnotationType = "length" | "area" | "count";

// Geometry drawn on the plan, owned by exactly one TakeoffMaterial row via
// materialId. A length/area row owns one annotation; a count row owns one
// annotation per placed marker.
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
}
