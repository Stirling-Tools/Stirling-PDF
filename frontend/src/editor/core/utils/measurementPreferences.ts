import type { MeasurementDisplaySettings } from "@editor/utils/measurementTypes";
import {
  DEFAULT_MEASUREMENT_COLOR,
  DEFAULT_MEASUREMENT_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  isSupportedUnit,
} from "@editor/utils/measurementUtils";

// Persist calibration unit preference across sessions
const STORAGE_KEY_LAST_CALIBRATION_UNIT = "stirling_calibration_last_unit";

export function getLastCalibrationUnit(defaultUnit: string): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LAST_CALIBRATION_UNIT);
    return stored && stored.trim() ? stored : defaultUnit;
  } catch {
    // Storage unavailable - private browsing or quota exceeded
    return defaultUnit;
  }
}

export function setLastCalibrationUnit(unit: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_CALIBRATION_UNIT, unit);
  } catch (error) {
    // Storage unavailable - preference won't be retained
    console.debug(
      "[MeasurementPreferences] Unable to persist unit preference:",
      error,
    );
  }
}

const STORAGE_KEY_DISPLAY_SETTINGS = "stirling_measurement_display";

export const DEFAULT_MEASUREMENT_DISPLAY_SETTINGS: MeasurementDisplaySettings =
  {
    displayUnit: "auto",
    precision: "auto",
    labelVisibility: "hideSmall",
    snapToPoints: true,
    snapToAngles: true,
    defaultColor: DEFAULT_MEASUREMENT_COLOR,
    defaultStrokeWidth: DEFAULT_MEASUREMENT_STROKE_WIDTH,
  };

const LABEL_VISIBILITY_MODES = ["hideSmall", "showAll", "hideAll"] as const;

function parseDisplaySettings(raw: unknown): MeasurementDisplaySettings {
  const defaults = DEFAULT_MEASUREMENT_DISPLAY_SETTINGS;
  if (typeof raw !== "object" || raw === null) return defaults;
  const s = raw as Record<string, unknown>;
  return {
    displayUnit:
      typeof s.displayUnit === "string" &&
      (s.displayUnit === "auto" || isSupportedUnit(s.displayUnit))
        ? s.displayUnit
        : defaults.displayUnit,
    precision:
      s.precision === "auto" ||
      (typeof s.precision === "number" &&
        Number.isInteger(s.precision) &&
        s.precision >= 0 &&
        s.precision <= 6)
        ? s.precision
        : defaults.precision,
    labelVisibility: LABEL_VISIBILITY_MODES.find(
      (mode) => mode === s.labelVisibility,
    )
      ? (s.labelVisibility as MeasurementDisplaySettings["labelVisibility"])
      : defaults.labelVisibility,
    snapToPoints:
      typeof s.snapToPoints === "boolean"
        ? s.snapToPoints
        : defaults.snapToPoints,
    snapToAngles:
      typeof s.snapToAngles === "boolean"
        ? s.snapToAngles
        : defaults.snapToAngles,
    defaultColor:
      typeof s.defaultColor === "string" &&
      /^#[0-9a-f]{6}$/i.test(s.defaultColor)
        ? s.defaultColor
        : defaults.defaultColor,
    defaultStrokeWidth:
      typeof s.defaultStrokeWidth === "number" &&
      s.defaultStrokeWidth >= MIN_STROKE_WIDTH &&
      s.defaultStrokeWidth <= MAX_STROKE_WIDTH
        ? s.defaultStrokeWidth
        : defaults.defaultStrokeWidth,
  };
}

export function getMeasurementDisplaySettings(): MeasurementDisplaySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DISPLAY_SETTINGS);
    return parseDisplaySettings(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_MEASUREMENT_DISPLAY_SETTINGS;
  }
}

export function setMeasurementDisplaySettings(
  settings: MeasurementDisplaySettings,
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_DISPLAY_SETTINGS,
      JSON.stringify(settings),
    );
  } catch {
    // Storage unavailable: settings last for this session only.
  }
}
