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
