import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

function isServerMode(mode: ConnectionMode | null): boolean {
  return mode === "saas" || mode === "selfhosted";
}

/**
 * Whether the desktop app is signed in to a server that serves the non-core API —
 * Stirling Cloud or a self-hosted instance. The bundled backend is core-flavour, so
 * local mode is never one however the user arrived there.
 *
 * Starts false and only becomes true once both signals resolve. This gates surfaces
 * that fetch on mount, and an optimistic default fires those requests at the bundled
 * backend, which answers 404 for every one of them.
 */
export function useConnectedServer(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isServer, setIsServer] = useState(() =>
    isServerMode(connectionModeService.getCachedMode()),
  );

  useEffect(
    () =>
      authService.subscribeToAuth((status) => {
        // "refreshing" and "oauth_pending" are transitional; reading them as signed
        // out would tear down the gated tree mid-refresh.
        if (status === "authenticated") {
          setIsAuthenticated(true);
        } else if (status === "unauthenticated") {
          setIsAuthenticated(false);
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
