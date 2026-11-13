import { useEffect, useState } from "react";
import {
  connectionModeService,
  type ConnectionMode,
} from "@editor/services/connectionModeService";

/** The live connection mode; null until the saved mode is known. */
export function useConnectionMode(): ConnectionMode | null {
  const [mode, setMode] = useState(() => connectionModeService.getCachedMode());

  useEffect(() => {
    let current = true;
    void connectionModeService.getCurrentMode().then((saved) => {
      if (current) setMode(saved);
    });
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (config) => {
        // A change can land before the saved mode resolves; that read is stale.
        current = false;
        setMode(config.mode);
      },
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return mode;
}
