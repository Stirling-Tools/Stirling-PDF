import { useState, useEffect } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Returns whether the app is currently in SaaS connection mode.
 * Starts optimistically true (most common for desktop) to avoid tools
 * being incorrectly marked unavailable during initial load.
 */
export function useSaaSMode(): boolean {
  const [isSaaSMode, setIsSaaSMode] = useState(true);

  useEffect(() => {
    void connectionModeService
      .getCurrentMode()
      .then((mode) => setIsSaaSMode(mode === "saas"));
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setIsSaaSMode(cfg.mode === "saas"),
    );
  }, []);

  return isSaaSMode;
}
