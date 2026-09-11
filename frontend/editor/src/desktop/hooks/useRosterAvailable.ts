import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Local mode is not signed into anything: the only backend is the bundled one,
 * whose accounts are this machine's rather than an organisation's. Offer the
 * roster only once connected to a server or to the cloud — the same reason the
 * local-mode nav keeps nothing but preferences, connection and about.
 *
 * <p>Answers false until the mode resolves, so an unconnected launch never
 * flashes a section it is about to take away.
 */
export function useRosterAvailable(): boolean {
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setMode);
    return connectionModeService.subscribeToModeChanges((config) =>
      setMode(config.mode),
    );
  }, []);

  return mode !== null && mode !== "local";
}
