import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";

/** Automation requires a confirmed server connection and session. */
export function usePoliciesEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let revision = 0;
    const refresh = (invalidate: boolean) => {
      const current = ++revision;
      if (invalidate) setEnabled(false);
      void Promise.all([
        connectionModeService.getCurrentMode(),
        authService.isAuthenticated(),
      ])
        .then(([mode, authenticated]) => {
          if (current === revision)
            setEnabled(mode !== "local" && authenticated);
        })
        .catch(() => {});
    };
    const unsubscribeMode = connectionModeService.subscribeToModeChanges(() =>
      refresh(true),
    );
    const unsubscribeAuth = authService.subscribeToAuth((status) =>
      refresh(status === "unauthenticated" || status === "oauth_pending"),
    );
    return () => {
      revision++;
      unsubscribeMode();
      unsubscribeAuth();
    };
  }, []);
  return enabled;
}
