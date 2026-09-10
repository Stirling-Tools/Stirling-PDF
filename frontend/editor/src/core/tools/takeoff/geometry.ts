import type {
  TakeoffAnnotation,
  TakeoffAnnotationType,
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

// Boundary length of a closed shape — same edge set as polygonArea (wraps
// back from the last point to the first), just summed as distances instead
// of the shoelace formula.
export function polygonPerimeter(points: TakeoffPoint[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += distance(points[i], points[j]);
  }
  return sum;
}

// Interior angle at `vertex` between rays to `a` and `b`, in degrees.
// Scale-invariant (an angle on the page is the same angle in reality), so
// callers never need to convert this through a page's calibrated scale.
export function angleBetween(
  vertex: TakeoffPoint,
  a: TakeoffPoint,
  b: TakeoffPoint,
): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function unitsPerPoint(scale: TakeoffPageScale): number {
  return scale.real / scale.pointsSpan;
}

/** Reads the type of geometry a material owns, or null if it owns none. */
export function ownAnnotationType(
  materialId: string,
  annotations: TakeoffAnnotation[],
): TakeoffAnnotationType | null {
  return annotations.find((a) => a.materialId === materialId)?.type ?? null;
}

export function ownSegmentCount(
  materialId: string,
  annotations: TakeoffAnnotation[],
): number {
  return annotations.filter((a) => a.materialId === materialId).length;
}

// Flat (unpitched) area of every annotation of `type` a material owns,
// summed across however many shapes/pages it was drawn on. A segment on a
// page with no calibrated scale contributes 0 rather than voiding the whole
// total — see the comment on computeValue for why. Shared by 'area' (used
// directly) and 'volume' (flat area x depth) since both are drawn as the
// same closed-polygon shape.
function sumFlatArea(
  materialId: string,
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, TakeoffPageScale>,
  type: "area" | "volume" = "area",
): number {
  return annotations
    .filter((a) => a.materialId === materialId && a.type === type)
    .reduce((sum, a) => {
      const scale = pageScales[a.page];
      if (!scale) return sum;
      const upp = unitsPerPoint(scale);
      return sum + polygonArea(a.points) * upp * upp;
    }, 0);
}

// A row's quantity is derived from the geometry it owns (materialId match).
// Which formula applies is read off the annotations' own type — set by
// whichever tool (Ruler / Area / Count) actually drew it — not the row's
// free-text unit label, so relabelling a unit never changes how it's
// measured.
//
// A row isn't limited to one shape: length and area rows sum every segment
// they own, the same way count rows already sum every marker — so a single
// "Interior Partition Walls" row can be measured a run at a time across
// several pages and still total correctly. Each segment converts through
// its OWN page's calibrated scale, so mixed-scale sheets stay correct. A
// segment on a page with no scale set yet just contributes 0 (rather than
// voiding the whole row's total) so the rest of the sum stays visible while
// that one page gets calibrated.
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
    const flat = sumFlatArea(material.id, annotations, pageScales, "area");

    const deducted = materials
      .filter((m) => m.deductsFromMaterialId === material.id)
      .reduce(
        (sum, m) => sum + sumFlatArea(m.id, annotations, pageScales, "area"),
        0,
      );

    const net = Math.max(0, flat - deducted);
    if (material.pitchDegrees) {
      const clamped = Math.min(89, Math.max(0, material.pitchDegrees));
      return net / Math.cos((clamped * Math.PI) / 180);
    }
    return net;
  }

  // volume: flat footprint area (no pitch/deduction — those are roof/opening
  // concepts specific to 'area' rows) x a per-row depth/height.
  if (first.type === "volume") {
    const flat = sumFlatArea(material.id, annotations, pageScales, "volume");
    return flat * (material.depthValue ?? 0);
  }

  if (first.type === "perimeter") {
    return own
      .filter((a) => a.type === "perimeter" && a.points.length >= 2)
      .reduce((sum, a) => {
        const scale = pageScales[a.page];
        if (!scale) return sum;
        return sum + polygonPerimeter(a.points) * unitsPerPoint(scale);
      }, 0);
  }

  // Angle is scale-invariant and doesn't accumulate the way a length/area
  // does — summing "45deg + 30deg" isn't a meaningful quantity — so a row
  // that ends up with several angle annotations is averaged instead.
  if (first.type === "angle") {
    const angles = own
      .filter((a) => a.type === "angle" && a.points.length >= 3)
      .map((a) => angleBetween(a.points[0], a.points[1], a.points[2]));
    if (angles.length === 0) return null;
    return angles.reduce((sum, v) => sum + v, 0) / angles.length;
  }

  // length / radius / diameter: all plain two-point distances through the
  // page's calibrated scale — a radius annotation's points are
  // [center, edge] and a diameter's are [edge, edge], so the same distance
  // formula already produces the right value for each.
  return own
    .filter(
      (a) =>
        (a.type === "length" || a.type === "radius" || a.type === "diameter") &&
        a.points.length >= 2,
    )
    .reduce((sum, a) => {
      const scale = pageScales[a.page];
      if (!scale) return sum;
      return sum + distance(a.points[0], a.points[1]) * unitsPerPoint(scale);
    }, 0);
}

export function roundTo2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

// Auto-detects a printed scale note from a page's extracted text, either a
// ratio ("1:50", "SCALE 1:100") or an architectural fraction
// ("1/4" = 1'-0"", "1" = 20'-0""), so most sheets never need a manual
// calibration drag. Best-effort only: a sheet with no legible scale note,
// or one marked "NOT TO SCALE"/"NTS", returns null and falls back to the
// existing manual calibration flow.
const RATIO_SCALE_RE = /\b1\s*:\s*(\d{1,4}(?:\.\d+)?)\b/;
const ARCH_SCALE_RE =
  /(\d+)\s*(?:\/\s*(\d+))?\s*["″]\s*=\s*(\d+)\s*['′]\s*-?\s*(\d+(?:\.\d+)?)?\s*["″]?/;
const NOT_TO_SCALE_RE = /\bnot\s+to\s+scale\b|\bnts\b/i;
const INCH_TO_M = 0.0254;

export function detectScaleFromText(text: string): TakeoffPageScale | null {
  if (NOT_TO_SCALE_RE.test(text)) return null;

  const archMatch = ARCH_SCALE_RE.exec(text);
  const ratioMatch = RATIO_SCALE_RE.exec(text);
  const preferArch =
    archMatch != null && (!ratioMatch || archMatch.index <= ratioMatch.index);

  if (preferArch && archMatch) {
    const [, num, den, feet, inches] = archMatch;
    const paperInches = den ? Number(num) / Number(den) : Number(num);
    const realInches = Number(feet) * 12 + (inches ? Number(inches) : 0);
    if (paperInches > 0 && realInches > 0) {
      return {
        pointsSpan: 72 * paperInches,
        real: realInches / 12,
        unit: "ft",
        source: "auto",
      };
    }
  }

  if (ratioMatch) {
    const n = Number(ratioMatch[1]);
    if (n >= 2 && n <= 2000) {
      return {
        pointsSpan: 72,
        real: n * INCH_TO_M,
        unit: "m",
        source: "auto",
      };
    }
  }

  return null;
}
