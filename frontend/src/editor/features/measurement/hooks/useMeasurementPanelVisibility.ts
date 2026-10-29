import { useCallback, useEffect, useState } from "react";

/** Measurement panel visibility is owned by the measurement feature. */
export function useMeasurementPanelVisibility(isRulerActive: boolean) {
  const [measurementPanelVisible, setMeasurementPanelVisible] = useState(false);
  const toggleMeasurementPanel = useCallback(() => {
    setMeasurementPanelVisible(visible => !visible);
  }, []);

  useEffect(() => {
    if (isRulerActive) setMeasurementPanelVisible(true);
  }, [isRulerActive]);

  return { measurementPanelVisible, setMeasurementPanelVisible, toggleMeasurementPanel };
}
