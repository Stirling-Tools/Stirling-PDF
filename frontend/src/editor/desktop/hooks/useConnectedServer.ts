import { useEffect, useState } from "react";
import { authService } from "@editor/services/authService";
import {
  connectionModeService,
  type ConnectionMode,
} from "@editor/services/connectionModeService";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";

function isServerMode(mode: ConnectionMode | null): boolean {
  return mode === "saas" || mode === "selfhosted";
}

export interface ConnectedServerState {
  connected: boolean;
  /** The mode this answer was read from, so callers never pair it with another read. */
  mode: ConnectionMode | null;
  /** False until both the session and the mode have been read once. */
  settled: boolean;
}

/** {@link useConnectedServer}, plus whether the answer is known yet: false at first means "not yet". */
export function useConnectedServerState(): ConnectedServerState {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const mode = useConnectionMode();
  // The mode stays null when the saved config cannot be read; settle as not connected then.
  const [modeUnreadable, setModeUnreadable] = useState(false);

  useEffect(() => {
    if (mode !== null) return;
    let active = true;
    connectionModeService.getCurrentMode().catch(() => {
      if (active) setModeUnreadable(true);
    });
    return () => {
      active = false;
    };
  }, [mode]);

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

  return {
    connected: isAuthenticated === true && isServerMode(mode),
    mode,
    settled: isAuthenticated !== null && (mode !== null || modeUnreadable),
  };
}

/** Whether the app is signed in to Stirling Cloud or a self-hosted server. Starts false: this
 *  gates surfaces that fetch on mount, and the bundled backend 404s every one of those calls. */
export function useConnectedServer(): boolean {
  return useConnectedServerState().connected;
}
