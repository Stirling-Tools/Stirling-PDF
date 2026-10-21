import { useEffect, useState } from "react";

/** Read the measurement panel docking state without owning it in Stirling core. */
export function useMeasurementDocked(): boolean {
  const [measurementDocked, setMeasurementDocked] = useState(false);

  useEffect(() => {
    const onDockChange = (event: Event) => {
      setMeasurementDocked((event as CustomEvent<boolean>).detail === true);
    };
    window.addEventListener("stirling-measure-dock-change", onDockChange);
    return () => window.removeEventListener("stirling-measure-dock-change", onDockChange);
  }, []);

  return measurementDocked;
}
