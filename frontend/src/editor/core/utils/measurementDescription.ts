import type { TFunction } from "i18next";
import type { Measurement, MeasureScale } from "@editor/utils/measurementTypes";
import {
  formatLength,
  pathLength,
  segmentAngle,
  toViewPoint,
  type MeasurementFormatSettings,
  type PageView,
} from "@editor/utils/measurementUtils";

/**
 * Angle of a→b as the user sees it on a rotated page, in degrees
 * counter-clockwise from pointing right.
 */
export function viewAngle(
  a: Measurement["points"][number],
  b: Measurement["points"][number],
  view: PageView | null,
): number {
  return segmentAngle(toViewPoint(a, view), toViewPoint(b, view));
}

/**
 * The secondary line under a measurement's value: horizontal and vertical
 * extent for a distance (as seen on screen), the perimeter of an area, or the
 * segment count of a path. Shared by the panel and the on-page label.
 */
export function describeMeasurement(
  t: TFunction,
  measurement: Measurement,
  scale: MeasureScale | null,
  settings: MeasurementFormatSettings,
  view: PageView | null,
): string {
  const { kind, points } = measurement;
  if (kind === "distance") {
    const a = toViewPoint(points[0], view);
    const b = toViewPoint(points[1], view);
    return t("measure.components", "H {{dx}}  V {{dy}}", {
      dx: formatLength(Math.abs(b.x - a.x), scale, settings),
      dy: formatLength(Math.abs(b.y - a.y), scale, settings),
    });
  }
  if (kind === "area") {
    return t("measure.perimeterValue", "Perimeter {{value}}", {
      value: formatLength(pathLength(points, true), scale, settings),
    });
  }
  return t("measure.segmentCount", "{{count}} segments", {
    count: points.length - 1,
  });
}
