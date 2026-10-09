import { useEffect, useState } from "react";
import { authService } from "@app/services/authService";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

function isServerMode(mode: ConnectionMode | null): boolean {
  return mode === "saas" || mode === "selfhosted";
}

export interface ConnectedServerState {
  connected: boolean;
  /** False until both the session and the mode have been read once. */
  settled: boolean;
}

/** {@link useConnectedServer}, plus whether the answer is known yet: false at first means "not yet". */
export function useConnectedServerState(): ConnectedServerState {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isServer, setIsServer] = useState<boolean | null>(() => {
    const cached = connectionModeService.getCachedMode();
    return cached === null ? null : isServerMode(cached);
  });

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
    let current = true;
    void connectionModeService.getCurrentMode().then(
      (mode) => {
        if (current) setIsServer(isServerMode(mode));
      },
      // An unreadable config keeps the cached answer, else none; a mode change still updates it.
      () => {
        if (current) setIsServer((known) => known ?? false);
      },
    );
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (config) => {
        current = false;
        setIsServer(isServerMode(config.mode));
      },
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  return {
    connected: isAuthenticated === true && isServer === true,
    settled: isAuthenticated !== null && isServer !== null,
  };
}

/** Whether the app is signed in to Stirling Cloud or a self-hosted server. Starts false: this
 *  gates surfaces that fetch on mount, and the bundled backend 404s every one of those calls. */
export function useConnectedServer(): boolean {
  return useConnectedServerState().connected;
}
