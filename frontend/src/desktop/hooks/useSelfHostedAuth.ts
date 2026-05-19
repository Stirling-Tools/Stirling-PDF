import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";

export interface SelfHostedAuthState {
  isSelfHosted: boolean;
  isAuthenticated: boolean;
}

/**
 * Tracks whether the desktop app is in self-hosted mode with an active
 * authenticated session. Refetches app config when the mode first transitions
 * to selfhosted, since the jwt-available config fetch fires against the local
 * bundled backend before the SetupWizard has switched the mode.
 */
export function useSelfHostedAuth(): SelfHostedAuthState {
  const { refetch } = useAppConfig();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSelfHosted, setIsSelfHosted] = useState(false);
  const wasSelfHosted = useRef(false);

  useEffect(() => {
    void connectionModeService
      .getCurrentMode()
      .then((mode) => setIsSelfHosted(mode === "selfhosted"));
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setIsSelfHosted(cfg.mode === "selfhosted"),
    );
  }, []);

  useEffect(() => {
    void authService.isAuthenticated().then(setIsAuthenticated);
    return authService.subscribeToAuth((status) =>
      setIsAuthenticated(status === "authenticated"),
    );
  }, []);

  useEffect(() => {
    if (isSelfHosted && !wasSelfHosted.current) {
      void refetch();
    }
    wasSelfHosted.current = isSelfHosted;
  }, [isSelfHosted, refetch]);

  return { isSelfHosted, isAuthenticated };
}
