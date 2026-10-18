import { useState, useEffect } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Returns whether the app is currently in SaaS connection mode.
 * Cloud requests stay disabled until the saved connection mode is known.
 */
export function useSaaSMode(): boolean {
  const [isSaaSMode, setIsSaaSMode] = useState(
    () => connectionModeService.getCachedMode() === "saas",
  );

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
