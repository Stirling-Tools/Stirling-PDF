import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

function isServerMode(mode: ConnectionMode | null): boolean {
  return mode === "saas" || mode === "selfhosted";
}

/** Whether the app is signed in to Stirling Cloud or a self-hosted server. Starts false: this
 *  gates surfaces that fetch on mount, and the bundled backend 404s every one of those calls. */
export function useConnectedServer(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isServer, setIsServer] = useState(() =>
    isServerMode(connectionModeService.getCachedMode()),
  );

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

  useEffect(() => {
    void connectionModeService
      .getCurrentMode()
      .then((mode) => setIsServer(isServerMode(mode)));
    return connectionModeService.subscribeToModeChanges((config) =>
      setIsServer(isServerMode(config.mode)),
    );
  }, []);

  return isAuthenticated && isServer;
}
