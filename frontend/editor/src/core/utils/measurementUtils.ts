// PDF point to real-world unit conversions

import type {
  Measurement,
  MeasureScale,
  PagePoint,
  CalibrationMetadata,
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
  return unit in POINT_TO_UNIT;
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

export function parsePresetRatio(preset: string): number {
  const parts = preset.split(":");

  // Must have exactly 2 parts and first part must be "1"
  if (parts.length !== 2 || parts[0].trim() !== "1") {
    return 0;
  }

  const value = Number(parts[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// UI dropdown options - shared across components
export const UNIT_OPTIONS = [
  { value: "m", label: "Meters (m)" },
  { value: "cm", label: "Centimeters (cm)" },
  { value: "mm", label: "Millimeters (mm)" },
  { value: "km", label: "Kilometers (km)" },
  { value: "ft", label: "Feet (ft)" },
  { value: "in", label: "Inches (in)" },
  { value: "yd", label: "Yards (yd)" },
  { value: "mi", label: "Miles (mi)" },
] as const;

/**
 * Detect quota exceeded errors across browser implementations.
 * Handles: name "QuotaExceededError", code 22, "NS_ERROR_DOM_QUOTA_REACHED"
 */
function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check by name (modern browsers, standard DOMException)
  if (error.name === "QuotaExceededError") return true;

  // Check by code (legacy DOMException code 22 for QuotaExceededError)
  if ("code" in error && (error as any).code === 22) return true;

  // Check for Safari/older implementation variants
  if (error.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;

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

// Save entry to sessionStorage with quota management (50-file limit)
export function saveSessionMap(
  key: string,
  fileKey: string,
  value: MeasureScale | Measurement[] | null,
): void {
  if (!fileKey) return;

  try {
    const existing: Record<string, unknown> = {
      ...loadSessionMap(key),
    };

    // Delete first to move fileKey to end (maintains insertion order recency)
    delete existing[fileKey];
    existing[fileKey] = value;

    // Enforce 50-file limit - keep only 40 most recent entries by insertion order
    const keys = Object.keys(existing);
    if (keys.length > 50) {
      const entriesToDelete = keys.slice(0, keys.length - 40);
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

// Reject cross-page measurements
export function validateMeasurement(obj: unknown): obj is Measurement {
  if (typeof obj !== "object" || obj === null) return false;

  const m = obj as Record<string, unknown>;

  // Validate structure
  if (
    !(
      typeof m.id === "string" &&
      m.id.trim().length > 0 &&
      validatePagePoint(m.start) &&
      validatePagePoint(m.end)
    )
  ) {
    return false;
  }

  // Reject cross-page measurements
  const start = m.start as PagePoint;
  const end = m.end as PagePoint;
  if (start.pageIndex !== end.pageIndex) {
    return false;
  }

  return true;
}

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
