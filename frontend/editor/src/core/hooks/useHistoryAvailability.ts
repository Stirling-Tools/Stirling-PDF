import { useEffect, useState } from "react";
import type { HistoryAPI } from "@app/components/viewer/viewerTypes";

export interface HistoryAvailability {
  canUndo: boolean;
  canRedo: boolean;
}

const NOTHING_TO_STEP: HistoryAvailability = { canUndo: false, canRedo: false };

export function useHistoryAvailability(
  historyApi: HistoryAPI | null,
): HistoryAvailability {
  const [availability, setAvailability] = useState(NOTHING_TO_STEP);

  useEffect(() => {
    if (!historyApi) {
      setAvailability(NOTHING_TO_STEP);
      return;
    }
    const update = () =>
      setAvailability({
        canUndo: historyApi.canUndo?.() ?? false,
        canRedo: historyApi.canRedo?.() ?? false,
      });
    const unsubscribe = historyApi.subscribe?.(update);
    update();
    return () => unsubscribe?.();
  }, [historyApi]);

  return availability;
}
