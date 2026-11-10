export const LENGTH_UNITS = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
} as const;

export type LengthUnit = keyof typeof LENGTH_UNITS;
export type AreaUnit = `${LengthUnit}2`;

export function convertLength(
  value: number,
  from: LengthUnit,
  to: LengthUnit,
): number {
  return value * LENGTH_UNITS[from] / LENGTH_UNITS[to];
}

export function convertArea(
  value: number,
  from: LengthUnit,
  to: LengthUnit,
): number {
  const ratio = LENGTH_UNITS[from] / LENGTH_UNITS[to];
  return value * ratio * ratio;
}

export function formatMeasurement(
  value: number,
  unit: LengthUnit,
  kind: "length" | "area",
): string {
  const suffix = kind === "area" ? `${unit}²` : unit;

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${suffix}`;
}
