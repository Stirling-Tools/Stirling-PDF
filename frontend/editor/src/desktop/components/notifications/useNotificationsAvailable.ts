import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";

/** The bundled backend has no notification API; wait for the mode before polling. */
export function useNotificationsAvailable(): boolean {
  const localOnly = useLocalProcessingOnly();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let current = true;
    void connectionModeService.getCurrentMode().then((mode) => {
      if (current) setAvailable(mode !== "local");
    });
    const unsubscribe = connectionModeService.subscribeToModeChanges((cfg) => {
      current = false;
      setAvailable(cfg.mode !== "local");
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return available && !localOnly;
}
