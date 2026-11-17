import { useEffect, useState } from "react";
import { authService } from "@editor/services/authService";
import type { ConnectionMode } from "@editor/services/connectionModeService";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";

function isServerMode(mode: ConnectionMode | null): boolean {
  return mode === "saas" || mode === "selfhosted";
}

/** Whether the app is signed in to Stirling Cloud or a self-hosted server. Starts false: this
 *  gates surfaces that fetch on mount, and the bundled backend 404s every one of those calls. */
export function useConnectedServer(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isServer = isServerMode(useConnectionMode());

  useEffect(
    () =>
      authService.subscribeToAuth((status, userInfo) => {
        // subscribeToAuth replays, so a mount mid-refresh sees only "refreshing"; the live user
        // it carries is what separates a warm refresh from a cold OAuth handshake.
        if (status === "authenticated") {
          setIsAuthenticated(true);
        } else if (status === "unauthenticated") {
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(userInfo != null);
        }
      }),
    [],
  );

  return isAuthenticated && isServer;
}
