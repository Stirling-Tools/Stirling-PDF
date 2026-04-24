/**
 * Measurement and Scale Conversion Utilities
 * Centralized constants and functions for PDF point to real-world unit conversions
 */

/**
 * Base conversion: 1 PDF point in meters
 * PDF points: 1/72 inch (standard screen DPI)
 * 1 inch = 0.0254 meters
 */
const POINT_TO_METERS = 0.0254 / 72;

/**
 * Conversion factors: how many units per 1 PDF point.
 * E.g. POINT_TO_UNIT["ft"] = how many feet in 1 PDF point
 */
export const POINT_TO_UNIT: Record<string, number> = {
  m: POINT_TO_METERS,
  cm: POINT_TO_METERS * 100,
  mm: POINT_TO_METERS * 1000,
  km: POINT_TO_METERS / 1000,
  ft: POINT_TO_METERS / 0.3048,
  in: POINT_TO_METERS / 0.0254,
  yd: POINT_TO_METERS / 0.9144,
  mi: POINT_TO_METERS / 1609.344,
};

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
  const normalized = unit.toLowerCase().trim();
  const factor = POINT_TO_UNIT[normalized];

  if (factor === undefined) {
    throw new Error(`Unsupported unit: ${unit}`);
  }

  return factor * ratio;
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
 * Check if unit is imperial
 */
export function isImperialUnit(unit: string): boolean {
  return ["ft", "in", "yd", "mi"].includes(unit.toLowerCase().trim());
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
  const src = sourceUnit.toLowerCase().trim();
  const tgt = targetUnit.toLowerCase().trim();

  const sourceFactor = POINT_TO_UNIT[src];
  const targetFactor = POINT_TO_UNIT[tgt];

  if (!sourceFactor || !targetFactor) {
    return null;
  }

  // Both factors are in meters per PDF point, so we can convert generically:
  // converted = value * (targetFactor / sourceFactor)
  return value * (targetFactor / sourceFactor);
}

/**
 * Parse architectural scale preset format (e.g., "1:100") to extract ratio
 * @example parsePresetRatio("1:100") returns 100
 * @example parsePresetRatio("1:12.5") returns 12.5
 * @returns ratio or 0 if parsing fails
 */
export function parsePresetRatio(preset: string): number {
  return Number(preset.split(":")[1]) || 0;
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
