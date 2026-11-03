import { useEffect, useState } from "react";
import { useViewer } from "@editor/contexts/ViewerContext";

/** Whether the viewer's pan mode is on, including when it already was at mount. */
export function useViewerIsPanning(): boolean {
  const { getPanState, registerImmediatePanUpdate } = useViewer();
  const [isPanning, setIsPanning] = useState(() => getPanState().isPanning);

  useEffect(
    () => registerImmediatePanUpdate(setIsPanning),
    [registerImmediatePanUpdate],
  );

  return isPanning;
}
