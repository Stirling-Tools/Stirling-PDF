// PDF point to real-world unit conversions

import type { TFunction } from "i18next";
import type {
  CalibrationMetadata,
  FileMeasureScales,
  Measurement,
  MeasurementDisplaySettings,
  MeasurementKind,
  MeasureScale,
  PageMeasureScales,
  PagePoint,
} from "@app/utils/measurementTypes";

// 1 PDF point in meters (1/72 inch)
const POINT_TO_METERS = 0.0254 / 72;

// Conversion factors: units per PDF point
export const POINT_TO_UNIT = {
  m: POINT_TO_METERS,
  cm: POINT_TO_METERS * 100,
  mm: POINT_TO_METERS * 1000,
  km: POINT_TO_METERS / 1000,
  ft: POINT_TO_METERS / 0.3048,
  in: POINT_TO_METERS / 0.0254,
  yd: POINT_TO_METERS / 0.9144,
  mi: POINT_TO_METERS / 1609.344,
} as const;

// Valid measurement units from POINT_TO_UNIT
export type MeasurementUnit = keyof typeof POINT_TO_UNIT;

function normalizeUnit(unit: string): string {
  return unit.toLowerCase().trim();
}

function isMeasurementUnit(unit: string): unit is MeasurementUnit {
  return Object.hasOwn(POINT_TO_UNIT, unit);
}

export function getUnitFactor(unit: string): number | undefined {
  const normalized = normalizeUnit(unit);
  if (!isMeasurementUnit(normalized)) {
    return undefined;
  }
  return POINT_TO_UNIT[normalized];
}

export function calculateScaleFactor(ratio: number, unit: string): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(`Invalid scale ratio: ${ratio}`);
  }

  const normalized = normalizeUnit(unit);
  if (!isMeasurementUnit(normalized)) {
    throw new Error(`Unsupported unit: ${unit}`);
  }

  return POINT_TO_UNIT[normalized] * ratio;
}

export function generateScaleLabel(ratio: number | null, unit: string): string {
  if (ratio === null || ratio === undefined) {
    return unit;
  }
  const display = Number.isInteger(ratio)
    ? ratio.toString()
    : ratio.toFixed(2).replace(/\.?0+$/, "");
  return `1:${display} (${unit})`;
}

// Imperial units
const IMPERIAL_UNITS = ["ft", "in", "yd", "mi"] as const;
export function isImperialUnit(unit: string): boolean {
  const normalized = normalizeUnit(unit);
  return isMeasurementUnit(normalized)
    ? (IMPERIAL_UNITS as readonly MeasurementUnit[]).includes(normalized)
    : false;
}

export function convertUnit(
  value: number,
  sourceUnit: string,
  targetUnit: string,
): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const src = normalizeUnit(sourceUnit);
  const tgt = normalizeUnit(targetUnit);

  if (!isMeasurementUnit(src) || !isMeasurementUnit(tgt)) {
    return null;
  }

  const sourceFactor = POINT_TO_UNIT[src];
  const targetFactor = POINT_TO_UNIT[tgt];

  return value * (targetFactor / sourceFactor);
}

export function isSupportedUnit(unit: string): unit is MeasurementUnit {
  return isMeasurementUnit(normalizeUnit(unit));
}

export function parsePresetRatio(preset: string): number | null {
  const parts = preset.split(":");

  // Must have exactly 2 parts and first part must be "1"
  if (parts.length !== 2 || parts[0].trim() !== "1") {
    return null;
  }

  const value = Number(parts[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// UI dropdown options - shared across components
export const UNIT_OPTIONS = [
  { value: "m", labelKey: "ruler.units.m", label: "Meters (m)" },
  { value: "cm", labelKey: "ruler.units.cm", label: "Centimeters (cm)" },
  { value: "mm", labelKey: "ruler.units.mm", label: "Millimeters (mm)" },
  { value: "km", labelKey: "ruler.units.km", label: "Kilometers (km)" },
  { value: "ft", labelKey: "ruler.units.ft", label: "Feet (ft)" },
  { value: "in", labelKey: "ruler.units.in", label: "Inches (in)" },
  { value: "yd", labelKey: "ruler.units.yd", label: "Yards (yd)" },
  { value: "mi", labelKey: "ruler.units.mi", label: "Miles (mi)" },
] as const;

/** UNIT_OPTIONS with labels translated; call at render time. */
export function getUnitOptions(
  t: TFunction,
): { value: (typeof UNIT_OPTIONS)[number]["value"]; label: string }[] {
  return UNIT_OPTIONS.map(({ value, labelKey, label }) => ({
    value,
    label: t(labelKey, label),
  }));
}

const MAX_SESSION_ENTRIES = 50;
const TRIMMED_SESSION_ENTRIES = 40;

/**
 * Detect quota exceeded errors across browser implementations.
 * Handles: name "QuotaExceededError", code 22 (legacy), "NS_ERROR_DOM_QUOTA_REACHED"
 *
 * Note: DOMException may not be instanceof Error in all browsers,
 * so we check by shape and properties rather than type.
 * Note: DOMException.code is deprecated but kept for legacy browser support.
 */
function isQuotaExceededError(error: unknown): boolean {
  if (error === null || error === undefined) return false;

  // Check if it's a DOMException when available (standard)
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return true;
  }

  // Fallback: check by shape for any object with name/code properties
  if (typeof error === "object") {
    const err = error as Record<string, unknown>;

    // Modern standard: check name property (works in all modern browsers)
    if (err.name === "QuotaExceededError") return true;
    if (err.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;

    // Legacy support: check deprecated code property for very old browsers
    // Use Object.hasOwn for safe own-property check
    if (Object.hasOwn(err, "code") && err.code === 22) return true;
  }

  return false;
}

// Load entries from sessionStorage
export function loadSessionMap(key: string): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};

    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return {};
    }

    return data as Record<string, unknown>;
  } catch {
    // Silently return empty object on parse error
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore cleanup errors
    }
    return {};
  }
}

// Save entry to sessionStorage with quota management.
export function saveSessionMap(
  key: string,
  fileKey: string,
  value: FileMeasureScales | Measurement[] | null,
): void {
  if (!fileKey) return;

  try {
    const existing: Record<string, unknown> = {
      ...loadSessionMap(key),
    };

    // Delete first to move fileKey to end (maintains insertion order recency)
    delete existing[fileKey];
    existing[fileKey] = value;

    // Trim back below the max to avoid pruning again on every subsequent save.
    const keys = Object.keys(existing);
    if (keys.length > MAX_SESSION_ENTRIES) {
      const entriesToDelete = keys.slice(
        0,
        keys.length - TRIMMED_SESSION_ENTRIES,
      );
      entriesToDelete.forEach((k) => delete existing[k]);
    }

    sessionStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    // Quota exceeded - try clearing and retrying (handles cross-browser error variants)
    if (isQuotaExceededError(e)) {
      try {
        sessionStorage.removeItem(key);
        // Retry with fresh storage
        const fresh: Record<string, unknown> = { [fileKey]: value };
        sessionStorage.setItem(key, JSON.stringify(fresh));
      } catch {
        // Silently ignore if retry fails - data loss is acceptable
      }
    }
    // Silently ignore other storage errors
  }
}

// Validation helpers

export function validatePagePoint(obj: unknown): obj is PagePoint {
  if (typeof obj !== "object" || obj === null) return false;

  const pt = obj as Record<string, unknown>;
  return (
    typeof pt.pageIndex === "number" &&
    Number.isFinite(pt.pageIndex) &&
    pt.pageIndex >= 0 &&
    typeof pt.x === "number" &&
    Number.isFinite(pt.x) &&
    typeof pt.y === "number" &&
    Number.isFinite(pt.y)
  );
}

// MeasureScale can be null (reset) or valid object
export function validateMeasureScale(obj: unknown): obj is MeasureScale | null {
  // null is allowed (reset to default)
  if (obj === null) return true;

  if (typeof obj !== "object") return false;

  const s = obj as Record<string, unknown>;

  // Validate factor: must be positive finite number
  if (
    typeof s.factor !== "number" ||
    !Number.isFinite(s.factor) ||
    s.factor <= 0
  ) {
    return false;
  }

  // Validate ratio: optional, but if present must be positive finite number
  if (
    s.ratio !== null &&
    (typeof s.ratio !== "number" || !Number.isFinite(s.ratio) || s.ratio <= 0)
  ) {
    return false;
  }

  // Validate unit: must be non-empty string and exist in POINT_TO_UNIT
  if (typeof s.unit !== "string" || s.unit.trim().length === 0) {
    return false;
  }

  const normalized = normalizeUnit(s.unit);
  if (!isMeasurementUnit(normalized)) {
    return false;
  }

  return true;
}

const MIN_POINTS: Record<MeasurementKind, number> = {
  distance: 2,
  perimeter: 2,
  area: 3,
};

export function minPointsFor(kind: MeasurementKind): number {
  return MIN_POINTS[kind];
}

function isMeasurementKind(value: unknown): value is MeasurementKind {
  return typeof value === "string" && Object.hasOwn(MIN_POINTS, value);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const MIN_STROKE_WIDTH = 0.5;
export const MAX_STROKE_WIDTH = 12;

/**
 * Parse a stored measurement, or null if it is malformed or spans pages.
 * Accepts the legacy two-point `{ id, start, end }` shape as a distance.
 */
export function normalizeMeasurement(obj: unknown): Measurement | null {
  if (typeof obj !== "object" || obj === null) return null;
  const m = obj as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.trim().length === 0) return null;

  const isLegacy = m.points === undefined && m.start !== undefined;
  const kind = isLegacy ? "distance" : m.kind;
  const rawPoints = isLegacy ? [m.start, m.end] : m.points;
  if (!isMeasurementKind(kind) || !Array.isArray(rawPoints)) return null;
  if (!rawPoints.every(validatePagePoint)) return null;

  const points = rawPoints.map(({ pageIndex, x, y }) => ({ pageIndex, x, y }));
  if (points.length < MIN_POINTS[kind]) return null;
  if (kind === "distance" && points.length !== 2) return null;
  if (points.some((pt) => pt.pageIndex !== points[0].pageIndex)) return null;

  const measurement: Measurement = { id: m.id, kind, points };
  if (typeof m.label === "string" && m.label.trim()) {
    measurement.label = m.label;
  }
  if (typeof m.color === "string" && HEX_COLOR.test(m.color)) {
    measurement.color = m.color;
  }
  if (
    typeof m.strokeWidth === "number" &&
    m.strokeWidth >= MIN_STROKE_WIDTH &&
    m.strokeWidth <= MAX_STROKE_WIDTH
  ) {
    measurement.strokeWidth = m.strokeWidth;
  }
  return measurement;
}

/** Parse stored scales; a bare MeasureScale or null is the legacy whole-file form. */
export function normalizeFileScales(obj: unknown): FileMeasureScales {
  const empty: FileMeasureScales = { defaultScale: null, pageScales: {} };
  if (obj === null || typeof obj !== "object") return empty;

  const record = obj as Record<string, unknown>;
  if ("factor" in record) {
    return validateMeasureScale(record)
      ? { defaultScale: record, pageScales: {} }
      : empty;
  }

  const defaultScale = validateMeasureScale(record.defaultScale)
    ? record.defaultScale
    : null;
  const pageScales: Record<number, MeasureScale> = {};
  if (typeof record.pageScales === "object" && record.pageScales !== null) {
    for (const [key, value] of Object.entries(record.pageScales)) {
      const pageIndex = Number(key);
      if (
        Number.isInteger(pageIndex) &&
        pageIndex >= 0 &&
        validateMeasureScale(value) &&
        value !== null
      ) {
        pageScales[pageIndex] = value;
      }
    }
  }
  return { defaultScale, pageScales };
}

export function segmentLength(a: PagePoint, b: PagePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(points: PagePoint[], closed: boolean): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += segmentLength(points[i - 1], points[i]);
  }
  if (closed && points.length > 2) {
    total += segmentLength(points[points.length - 1], points[0]);
  }
  return total;
}

/** Shoelace area in square PDF points; self-intersecting rings are not split. */
export function polygonArea(points: PagePoint[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Area-weighted centroid, falling back to the vertex mean for degenerate rings. */
export function polygonCentroid(points: { x: number; y: number }[]): {
  x: number;
  y: number;
} {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twice += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twice) < 1e-9) {
    const n = points.length || 1;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / n,
      y: points.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

interface XY {
  x: number;
  y: number;
}

/**
 * Direction of a→b in degrees, counter-clockwise from pointing right, in
 * (-180, 180]. y grows downwards, so "up" is +90.
 */
export function segmentAngle(a: XY, b: XY): number {
  const degrees = (Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI;
  return degrees === -180 ? 180 : degrees;
}

/** The point `length` units from `start` in the direction `degrees`. */
export function pointAtAngle(start: XY, length: number, degrees: number): XY {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: start.x + length * Math.cos(radians),
    y: start.y - length * Math.sin(radians),
  };
}

/**
 * How a page is shown: its unrotated size in PDF points and the quarter turns
 * clockwise it is displayed at (page /Rotate plus the viewer's rotation).
 */
export interface PageView {
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
}

/**
 * Page space to view space: the page as the user sees it, origin top-left.
 * Must match rotatePosition in @embedpdf/models, which places the pages.
 */
export function toViewPoint(point: XY, view: PageView | null): XY {
  if (!view) return { x: point.x, y: point.y };
  const { width, height } = view;
  switch (view.rotation) {
    case 1:
      return { x: height - point.y, y: point.x };
    case 2:
      return { x: width - point.x, y: height - point.y };
    case 3:
      return { x: point.y, y: width - point.x };
    default:
      return { x: point.x, y: point.y };
  }
}

export function fromViewPoint(
  point: XY,
  view: PageView | null,
  pageIndex: number,
): PagePoint {
  if (!view) return { pageIndex, x: point.x, y: point.y };
  const { width, height } = view;
  switch (view.rotation) {
    case 1:
      return { pageIndex, x: point.y, y: height - point.x };
    case 2:
      return { pageIndex, x: width - point.x, y: height - point.y };
    case 3:
      return { pageIndex, x: width - point.y, y: point.x };
    default:
      return { pageIndex, x: point.x, y: point.y };
  }
}

/**
 * Scale for a measurement on `pageIndex`: the page override, then the file
 * default, then the PDF's embedded viewport containing `anchor`, then the
 * PDF's whole-page viewport. `anchor` is in page space with y down.
 */
export function resolveScale(
  pageIndex: number,
  anchor: { x: number; y: number },
  fileScales: FileMeasureScales,
  embeddedScales: PageMeasureScales | null | undefined,
): MeasureScale | null {
  const pageScale = fileScales.pageScales[pageIndex];
  if (pageScale) return pageScale;
  if (fileScales.defaultScale) return fileScales.defaultScale;

  const info = embeddedScales?.get(pageIndex);
  if (!info?.viewports.length) return null;

  // Viewport bboxes are in PDF user space, where y grows up from the bottom.
  const mx = anchor.x;
  const my = info.pageHeight - anchor.y;
  let wholePage: MeasureScale | null = null;
  for (const { bbox, scale } of info.viewports) {
    if (!bbox) {
      wholePage ??= scale;
      continue;
    }
    const [x0, y0, x1, y1] = bbox;
    if (
      mx >= Math.min(x0, x1) &&
      mx <= Math.max(x0, x1) &&
      my >= Math.min(y0, y1) &&
      my <= Math.max(y0, y1)
    ) {
      return scale;
    }
  }
  return wholePage;
}

/**
 * The scale to show for a page as a whole: as resolveScale, except that a
 * PDF scale covering only a region of the page still counts, since a page
 * whose drawing sits in one viewport is measured at that viewport's scale.
 */
export function resolvePageScale(
  pageIndex: number,
  fileScales: FileMeasureScales,
  embeddedScales: PageMeasureScales | null | undefined,
): MeasureScale | null {
  const pageScale = fileScales.pageScales[pageIndex];
  if (pageScale) return pageScale;
  if (fileScales.defaultScale) return fileScales.defaultScale;
  const viewports = embeddedScales?.get(pageIndex)?.viewports ?? [];
  return (
    viewports.find((viewport) => viewport.bbox === null)?.scale ??
    viewports[0]?.scale ??
    null
  );
}

export function getDecimalPlaces(value: number): number {
  const absVal = Math.abs(value);

  const decimalRanges = [
    { threshold: 1000000, decimals: 0 },
    { threshold: 1000, decimals: 2 },
    { threshold: 1, decimals: 3 },
    { threshold: 0.1, decimals: 3 },
    { threshold: 0.01, decimals: 4 },
    { threshold: 0.001, decimals: 5 },
  ];

  return decimalRanges.find((r) => absVal >= r.threshold)?.decimals ?? 6;
}

/** Real-world `unit`s per PDF point under `scale`, or on paper when unscaled. */
export function unitsPerPoint(
  scale: MeasureScale | null,
  unit: MeasurementUnit,
): number {
  const source = scale ? normalizeUnit(scale.unit) : null;
  if (!scale || !source || !isMeasurementUnit(source)) {
    return POINT_TO_UNIT[unit];
  }
  return scale.factor * (POINT_TO_UNIT[unit] / POINT_TO_UNIT[source]);
}

function paperLengthUnit(pts: number): MeasurementUnit {
  const mm = pts * POINT_TO_UNIT.mm;
  if (mm < 100) return "mm";
  if (mm < 1000) return "cm";
  return "m";
}

function paperAreaUnit(sqPts: number): MeasurementUnit {
  const sqMm = sqPts * POINT_TO_UNIT.mm ** 2;
  if (sqMm < 10_000) return "mm";
  if (sqMm < 1_000_000) return "cm";
  return "m";
}

function resolveDisplayUnit(
  scale: MeasureScale | null,
  settings: Pick<MeasurementDisplaySettings, "displayUnit">,
  paperFallback: MeasurementUnit,
): MeasurementUnit {
  const chosen = normalizeUnit(settings.displayUnit);
  if (isMeasurementUnit(chosen)) return chosen;
  const scaleUnit = scale ? normalizeUnit(scale.unit) : null;
  if (scaleUnit && isMeasurementUnit(scaleUnit)) return scaleUnit;
  return paperFallback;
}

function formatNumber(
  value: number,
  precision: MeasurementDisplaySettings["precision"],
  autoDecimals: number,
): string {
  const decimals = precision === "auto" ? autoDecimals : precision;
  return value.toFixed(Math.max(0, Math.min(10, decimals)));
}

/**
 * One unit for typing exact values, which must not change with the value the
 * way "auto" display does: the chosen display unit, else the scale's, else mm.
 */
export function editingUnit(
  scale: MeasureScale | null,
  settings: Pick<MeasurementDisplaySettings, "displayUnit">,
): MeasurementUnit {
  return resolveDisplayUnit(scale, settings, "mm");
}

export type MeasurementFormatSettings = Pick<
  MeasurementDisplaySettings,
  "displayUnit" | "precision"
>;

export function formatLength(
  pts: number,
  scale: MeasureScale | null,
  settings: MeasurementFormatSettings,
): string {
  const unit = resolveDisplayUnit(scale, settings, paperLengthUnit(pts));
  const value = pts * unitsPerPoint(scale, unit);
  if (value === 0) return `0 ${unit}`;
  const isPaperAuto = !scale && settings.displayUnit === "auto";
  const autoDecimals = isPaperAuto
    ? unit === "m"
      ? 2
      : 1
    : getDecimalPlaces(value);
  return `${formatNumber(value, settings.precision, autoDecimals)} ${unit}`;
}

export function formatArea(
  sqPts: number,
  scale: MeasureScale | null,
  settings: MeasurementFormatSettings,
): string {
  const unit = resolveDisplayUnit(scale, settings, paperAreaUnit(sqPts));
  const value = sqPts * unitsPerPoint(scale, unit) ** 2;
  if (value === 0) return `0 ${unit}²`;
  return `${formatNumber(value, settings.precision, getDecimalPlaces(value))} ${unit}²`;
}

/** The headline value for a measurement: length, path length, or area. */
export function formatMeasurementValue(
  measurement: Pick<Measurement, "kind" | "points">,
  scale: MeasureScale | null,
  settings: MeasurementFormatSettings,
): string {
  if (measurement.kind === "area") {
    return formatArea(polygonArea(measurement.points), scale, settings);
  }
  return formatLength(pathLength(measurement.points, false), scale, settings);
}

/**
 * Colours offered for measurements. Literal rather than theme tokens because
 * they are drawn into the PDF when measurements are saved and must not change
 * with the viewer's theme.
 */
export const MEASUREMENT_COLORS = [
  "#1e88e5", // theme-allow-color measurement colour data
  "#e53935", // theme-allow-color measurement colour data
  "#43a047", // theme-allow-color measurement colour data
  "#fb8c00", // theme-allow-color measurement colour data
  "#8e24aa", // theme-allow-color measurement colour data
  "#00897b", // theme-allow-color measurement colour data
  "#212121", // theme-allow-color measurement colour data
] as const;

export const DEFAULT_MEASUREMENT_COLOR = MEASUREMENT_COLORS[0];
export const DEFAULT_MEASUREMENT_STROKE_WIDTH = 2;

export function formatPaperDistance(distancePts: number): string {
  if (!Number.isFinite(distancePts) || distancePts < 0) {
    return "0 mm";
  }

  const inches = distancePts / 72;
  const mm = inches * 25.4;

  if (mm < 100) {
    return `${mm.toFixed(1)} mm`;
  }
  if (mm < 1000) {
    return `${(mm / 10).toFixed(1)} cm`;
  }
  return `${(mm / 1000).toFixed(2)} m`;
}

export function validateRealDistance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  return num;
}

export function deriveRatioFromFactor(
  factor: number,
  unit: string,
): number | null {
  if (!Number.isFinite(factor) || factor <= 0) {
    return null;
  }

  const baseFactor = getUnitFactor(unit);
  if (!baseFactor) {
    return null;
  }

  // ratio = factor / baseFactor
  const ratio = factor / baseFactor;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function calculateCalibratedScale(
  pdfDistancePts: number,
  realDistance: number,
  unit: string,
): MeasureScale {
  if (!Number.isFinite(pdfDistancePts) || pdfDistancePts <= 0) {
    throw new Error("Invalid PDF distance (must be positive)");
  }

  if (!Number.isFinite(realDistance) || realDistance <= 0) {
    throw new Error("Invalid real-world distance (must be positive)");
  }

  const baseFactor = getUnitFactor(unit);
  if (!baseFactor) {
    throw new Error(`Unsupported unit: ${unit}`);
  }

  const factor = realDistance / pdfDistancePts;
  const ratio = deriveRatioFromFactor(factor, unit);

  return {
    factor,
    ratio,
    unit,
  };
}

export function createCalibrationMetadata(
  pdfDistancePts: number,
  realDistance: number,
  scale: MeasureScale,
  unitUsed: string,
): CalibrationMetadata {
  return {
    pdfDistancePts,
    realDistance,
    scale,
    timestamp: new Date().toISOString(),
    unitUsed,
  };
}
