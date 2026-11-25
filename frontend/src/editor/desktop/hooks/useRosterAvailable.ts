import { useConnectionMode } from "@editor/hooks/useConnectionMode";

/** Local mode's accounts are this machine's, not an org's, so the roster waits
 *  for a server or cloud connection - and for the mode, to avoid a flash. */
export function useRosterAvailable(): boolean {
  const mode = useConnectionMode();
  return mode !== null && mode !== "local";
}
