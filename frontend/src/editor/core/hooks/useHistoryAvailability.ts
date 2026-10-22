import { useEffect, useRef, useState, type RefObject } from "react";
import type { HistoryAPI } from "@app/components/viewer/viewerTypes";

export interface HistoryAvailability {
  canUndo: boolean;
  canRedo: boolean;
}

const NOTHING_TO_STEP: HistoryAvailability = { canUndo: false, canRedo: false };

export function useHistoryAvailability(
  historyApiRef: RefObject<HistoryAPI | null>,
): HistoryAvailability {
  const [availability, setAvailability] = useState(NOTHING_TO_STEP);
  const subscription = useRef<{
    api: HistoryAPI | null;
    unsubscribe?: () => void;
  }>({ api: null });

  useEffect(() => {
    const historyApi = historyApiRef.current;
    if (subscription.current.api === historyApi) return;
    subscription.current.unsubscribe?.();
    subscription.current = { api: historyApi };
    if (!historyApi) {
      setAvailability(NOTHING_TO_STEP);
      return;
    }
    const update = () =>
      setAvailability({
        canUndo: historyApi.canUndo?.() ?? false,
        canRedo: historyApi.canRedo?.() ?? false,
      });
    subscription.current.unsubscribe = historyApi.subscribe?.(update);
    update();
  });

  useEffect(
    () => () => {
      subscription.current.unsubscribe?.();
      subscription.current = { api: null };
    },
    [],
  );

  return availability;
}
