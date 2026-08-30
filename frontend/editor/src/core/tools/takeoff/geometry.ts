import type {
  TakeoffAnnotation,
  TakeoffMaterial,
  TakeoffPageScale,
  TakeoffPoint,
} from "@app/tools/takeoff/types";

export function distance(a: TakeoffPoint, b: TakeoffPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polygonArea(points: TakeoffPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

function unitsPerPoint(scale: TakeoffPageScale): number {
  return scale.real / scale.pointsSpan;
}

// A row's quantity is derived from the geometry it owns (materialId match).
// Which formula applies is read off the annotation's own type — set by
// whichever tool (Ruler / Area / Count) actually drew it — not the row's
// free-text unit label, so relabelling a unit never changes how it's
// measured.
export function computeValue(
  material: TakeoffMaterial,
  materials: TakeoffMaterial[],
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, TakeoffPageScale>,
): number | null {
  const own = annotations.filter((a) => a.materialId === material.id);
  const first = own[0];
  if (!first) return null;

  if (first.type === "count") return own.length;

  if (first.type === "area") {
    const scale = pageScales[first.page];
    if (!scale) return null;
    const upp = unitsPerPoint(scale);
    const flat = polygonArea(first.points) * upp * upp;

    const deducted = materials
      .filter((m) => m.deductsFromMaterialId === material.id)
      .reduce((sum, m) => {
        const dAnn = annotations.find((a) => a.materialId === m.id);
        if (!dAnn) return sum;
        const dScale = pageScales[dAnn.page];
        if (!dScale) return sum;
        const dUpp = unitsPerPoint(dScale);
        return sum + polygonArea(dAnn.points) * dUpp * dUpp;
      }, 0);

    const net = Math.max(0, flat - deducted);
    if (material.pitchDegrees) {
      const clamped = Math.min(89, Math.max(0, material.pitchDegrees));
      return net / Math.cos((clamped * Math.PI) / 180);
    }
    return net;
  }

  // length
  const scale = pageScales[first.page];
  if (!scale) return null;
  if (first.points.length < 2) return null;
  return distance(first.points[0], first.points[1]) * unitsPerPoint(scale);
}

export function roundTo2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}
