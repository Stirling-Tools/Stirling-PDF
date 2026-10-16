import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/** Local mode's accounts are this machine's, not an org's, so the roster waits
 *  for a server or cloud connection - and for the mode, to avoid a flash. */
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
