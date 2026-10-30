/** Measurement feature public entry point. Styling and viewer infrastructure remain owned by Stirling. */
export { MeasurementPanel } from "./components/MeasurementPanel";
export { exportMeasurementExcel } from "./utils/measurementExcelExport";
export { calculateMeasurementRows, MEASURE_UNITS, SCALE_OPTIONS, GROUP_COLORS } from "./utils/measurementRows";
export type { MeasurementGroup, MeasurementRow } from "./utils/measurementRows";
export type { Measurement, MeasureScale, PagePoint } from "./utils/measurementTypes";
export type { LengthUnit } from "@editor/utils/measurementUnits";

export { RulerOverlay } from "./components/RulerOverlay";
export type { RulerOverlayHandle } from "./components/RulerOverlay";

export { useMeasurementGroups } from "./hooks/useMeasurementGroups";
export { useMeasurementBackup } from "./hooks/useMeasurementBackup";
export { useMeasurementControls } from "./hooks/useMeasurementControls";
export { useMeasurementPanelVisibility } from "./hooks/useMeasurementPanelVisibility";

export { useMeasurementDocked } from "./hooks/useMeasurementDocked";
