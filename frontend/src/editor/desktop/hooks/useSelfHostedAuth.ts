import { useState, useEffect, useRef } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { authService } from "@app/services/authService";
import { connectionModeService } from "@app/services/connectionModeService";

export interface SelfHostedAuthState {
  isSelfHosted: boolean;
  isAuthenticated: boolean;
  /** False only once both desktop checks have resolved. */
  loading: boolean;
}

/**
 * Tracks whether the desktop app is in self-hosted mode with an active
 * authenticated session. Refetches app config when the mode first transitions
 * to selfhosted, since the jwt-available config fetch fires against the local
 * bundled backend before the SetupWizard has switched the mode.
 */
export function useSelfHostedAuth(): SelfHostedAuthState {
  const { refetch } = useAppConfig();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isSelfHosted, setIsSelfHosted] = useState<boolean | null>(null);
  const wasSelfHosted = useRef(false);

  useEffect(() => {
    let current = true;
    void connectionModeService.getCurrentMode().then((mode) => {
      if (current) setIsSelfHosted(mode === "selfhosted");
    });
    const unsubscribe = connectionModeService.subscribeToModeChanges((cfg) => {
      current = false;
      setIsSelfHosted(cfg.mode === "selfhosted");
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let current = true;
    let subscribed = false;
    const unsubscribe = authService.subscribeToAuth((status) => {
      // The immediate notification can precede restoration from the keyring.
      if (!subscribed) return;
      current = false;
      setIsAuthenticated(
        status === "refreshing" || status === "oauth_pending"
          ? null
          : status === "authenticated",
      );
    });
    subscribed = true;
    void authService.isAuthenticated().then((authenticated) => {
      if (current) setIsAuthenticated(authenticated);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isSelfHosted && !wasSelfHosted.current) {
      void refetch();
    }
    wasSelfHosted.current = isSelfHosted === true;
  }, [isSelfHosted, refetch]);

  return {
    isSelfHosted: isSelfHosted === true,
    isAuthenticated: isAuthenticated === true,
    loading: isSelfHosted === null || isAuthenticated === null,
  };
}
