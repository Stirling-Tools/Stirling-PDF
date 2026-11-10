import { polygonArea, polygonPerimeter } from "./measurementArea";
import { convertLength, convertArea, type LengthUnit } from "@editor/utils/measurementUnits";
import type { Measurement, MeasureScale } from "./measurementTypes";

export type MeasurementGroup = { id: string; name: string; color: string; lineWidth?: number };
export type MeasurementRow = {
  id: string;
  groupId: string;
  area: boolean;
  meters: number;
  squareMeters: number;
  label: string;
};

export function calculateMeasurementRows(
  measurements: Measurement[],
  groups: MeasurementGroup[],
  scale: MeasureScale | null,
  generalName: string,
): MeasurementRow[] {
  const counts: Record<string, number> = {};
  const groupNames = new Map(groups.map(group => [group.id, group.name]));
  const source = scale?.unit as LengthUnit | undefined;
  const from: LengthUnit = source && MEASURE_UNITS.includes(source) ? source : "m";
  const factor = scale && Number.isFinite(scale.factor) && scale.factor > 0 ? scale.factor : null;
  return measurements.map(measurement => {
    const groupId = measurement.groupId ?? "default";
    const groupName = groupNames.get(groupId) ?? generalName;
    counts[groupId] = (counts[groupId] ?? 0) + 1;
    const area = (measurement.kind === "area" || measurement.kind === "rectangle") && !!measurement.points?.length;
    const dx = measurement.end.x - measurement.start.x;
    const dy = measurement.end.y - measurement.start.y;
    const points = measurement.points ?? [];
    const length = area ? polygonPerimeter(points) : Math.hypot(dx, dy);
    const surface = area ? polygonArea(points) : 0;
    return {
      id: measurement.id,
      groupId,
      area,
      meters: factor === null ? 0 : convertLength(length * factor, from, "m"),
      squareMeters: factor === null ? 0 : convertArea(surface * factor * factor, from, "m"),
      label: `${groupName} ${counts[groupId]}`,
    };
  });
}

export const MEASURE_UNITS: LengthUnit[] = ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"];
export const SCALE_OPTIONS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000];
export const GROUP_COLORS = ["#299bff", "#ff9e44", "#35d29a", "#c98cff", "#ff6584", "#e6cb42"];
