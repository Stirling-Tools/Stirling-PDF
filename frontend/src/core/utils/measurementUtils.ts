/**
 * Measurement and Scale Conversion Utilities
 * Centralized constants and functions for PDF point to real-world unit conversions
 */

import type {
  Measurement,
  MeasureScaleLike,
  PagePoint,
} from "@app/utils/measurementTypes";

/**
 * Base conversion: 1 PDF point in meters
 * PDF points: 1/72 inch (standard screen DPI)
 * 1 inch = 0.0254 meters
 */
const POINT_TO_METERS = 0.0254 / 72;

/**
 * Conversion factors: how many units per 1 PDF point.
 * E.g. POINT_TO_UNIT["ft"] = how many feet in 1 PDF point
 * Source of truth for valid measurement units.
 */
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

/**
 * Valid measurement units.
 * Derived from POINT_TO_UNIT to maintain single source of truth.
 */
export type MeasurementUnit = keyof typeof POINT_TO_UNIT;

/**
 * Normalize unit string to lowercase and trimmed form.
 */
function normalizeUnit(unit: string): string {
  return unit.toLowerCase().trim();
}

/**
 * Type guard to check if a string is a valid MeasurementUnit.
 */
function isMeasurementUnit(unit: string): unit is MeasurementUnit {
  return unit in POINT_TO_UNIT;
}

/**
 * Get conversion factor for a unit, or undefined if invalid.
 */
export function getUnitFactor(unit: string): number | undefined {
  const normalized = normalizeUnit(unit);
  if (!isMeasurementUnit(normalized)) {
    return undefined;
  }
  return POINT_TO_UNIT[normalized];
}

/**
 * Calculate conversion factor from PDF points to real-world units
 * @param ratio - Architectural scale ratio (e.g., 100 for "1:100")
 * @param unit - Unit name (e.g., "m", "ft")
 * @returns factor where: real_world_value = pdf_points * factor
 *
 * Example: ratio=100, unit="m"
 * factor = 0.000352778 * 100 = 0.0352778
 * So 1 PDF point = 0.0352778 meters in the scale
 *
 * @throws Error if unit is not supported
 */
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

/**
 * Generate human-readable label for the scale
 * Preserves decimal precision for non-integer ratios
 * @example `1:100 (m)` for ratio=100
 * @example `1:12.5 (ft)` for ratio=12.5
 * @example `m` for ratio=null (unknown unit)
 */
export function generateScaleLabel(ratio: number | null, unit: string): string {
  if (ratio === null || ratio === undefined) {
    return unit;
  }
  const display = Number.isInteger(ratio)
    ? ratio.toString()
    : ratio.toFixed(2).replace(/\.?0+$/, "");
  return `1:${display} (${unit})`;
}

/**
 * Imperial units - immutable constant
 */
const IMPERIAL_UNITS = ["ft", "in", "yd", "mi"] as const;

/**
 * Check if unit is imperial
 */
export function isImperialUnit(unit: string): boolean {
  const normalized = normalizeUnit(unit);
  return isMeasurementUnit(normalized)
    ? (IMPERIAL_UNITS as readonly MeasurementUnit[]).includes(normalized)
    : false;
}

/**
 * Convert a value from one unit to another.
 * Both units must exist in POINT_TO_UNIT.
 *
 * @param value - The value in sourceUnit
 * @param sourceUnit - The unit of the input value
 * @param targetUnit - The unit to convert to
 * @returns The value converted to targetUnit, or null if unit is invalid
 *
 * @example
 * convertUnit(1, 'm', 'ft') // 1 meter to feet ≈ 3.281
 * convertUnit(100, 'ft', 'in') // 100 feet to inches = 1200
 */
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

/**
 * Parse architectural scale preset format (e.g., "1:100") to extract ratio
 * @example parsePresetRatio("1:100") returns 100
 * @example parsePresetRatio("1:12.5") returns 12.5
 * @returns ratio or 0 if parsing fails
 */
export function parsePresetRatio(preset: string): number {
  const parts = preset.split(":");

  // Must have exactly 2 parts and first part must be "1"
  if (parts.length !== 2 || parts[0].trim() !== "1") {
    return 0;
  }

  const value = Number(parts[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Unit options for UI dropdowns
 * Shared across components to ensure consistency
 */
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
 * Session storage helpers.
 */

/**
 * Load all entries for a measurement key from sessionStorage
 * Handles parse errors gracefully - returns empty object on corruption
 *
 * @param key - Storage key (e.g., "stirling_scales", "stirling_measurements")
 * @returns Object mapping fileKey → measurement data, empty object on error
 */
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

/**
 * Save a measurement entry to sessionStorage with quota management.
 * Enforces 50-file limit, keeping 40 most recent entries when exceeded.
 */
export function saveSessionMap(
  key: string,
  fileKey: string,
  value: MeasureScaleLike | Measurement[] | null,
): void {
  if (!fileKey) return;

  try {
    const existing: Record<string, unknown> = {
      ...loadSessionMap(key),
    };
    existing[fileKey] = value;

    // Enforce 50-file limit - keep only 40 most recent on exceed
    const keys = Object.keys(existing);
    if (keys.length > 50) {
      const entriesToDelete = keys.slice(0, keys.length - 40);
      entriesToDelete.forEach((k) => delete existing[k]);
    }

    sessionStorage.setItem(key, JSON.stringify(existing));
  } catch (e) {
    // QuotaExceededError - try clearing and retrying
    if (e instanceof Error && e.name === "QuotaExceededError") {
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

/**
 * Validation helpers.
 */

/**
 * Validate PagePoint structure.
 */
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

/**
 * Validate MeasureScale structure.
 * Accepts null (reset to default) or valid object.
 */
export function validateMeasureScale(
  obj: unknown,
): obj is MeasureScaleLike | null {
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

/**
 * Validate Measurement object.
 * Rejects cross-page measurements.
 */
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
