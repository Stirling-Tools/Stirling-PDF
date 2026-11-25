import { useEffect, useRef } from "react";
import { useBackendHealth } from "@editor/hooks/useBackendHealth";
import { useAppConfig } from "@editor/contexts/AppConfigContext";

/**
 * Desktop-only bridge that refetches the app config once the bundled backend
 * becomes healthy (and whenever it restarts). Keeps the UI responsive by using
 * default config until the real config is available.
 */
export function DesktopConfigSync() {
  const { status } = useBackendHealth();
  const { refetch } = useAppConfig();
  // Null so a backend that was already healthy at mount still triggers the first fetch.
  const previousStatus = useRef<typeof status | null>(null);

  useEffect(() => {
    if (status === "healthy" && previousStatus.current !== "healthy") {
      refetch();
    }
    previousStatus.current = status;
  }, [status, refetch]);

  return null;
}
