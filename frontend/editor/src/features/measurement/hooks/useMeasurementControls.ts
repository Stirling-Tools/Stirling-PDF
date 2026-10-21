import { useState } from "react";
import type { LengthUnit } from "@app/utils/measurementUnits";

export type MeasurementTool = "length" | "rectangle" | "polygon";

/** Measurement-specific UI selections; Stirling still owns the PDF viewer. */
export function useMeasurementControls() {
  const [measurementUnit, setMeasurementUnit] = useState<LengthUnit>("m");
  const [measurementTool, setMeasurementTool] = useState<MeasurementTool>("length");
  return { measurementUnit, setMeasurementUnit, measurementTool, setMeasurementTool };
}
