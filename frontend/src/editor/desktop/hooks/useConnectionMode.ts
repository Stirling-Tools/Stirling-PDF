import { useEffect, useState } from "react";
import {
  connectionModeService,
  type ConnectionMode,
} from "@editor/services/connectionModeService";

export function useConnectionMode(): ConnectionMode | null {
  const [mode, setMode] = useState<ConnectionMode | null>(() =>
    connectionModeService.getCachedMode(),
  );
  useEffect(() => {
    let active = true;
    void connectionModeService.getCurrentMode().then(
      (current) => {
        if (active) setMode(current);
      },
      () => undefined,
    );
    const unsubscribe = connectionModeService.subscribeToModeChanges((config) =>
      setMode(config.mode),
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return mode;
}
