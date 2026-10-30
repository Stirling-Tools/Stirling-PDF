import { connectionModeService } from "@editor/services/connectionModeService";
import { saasServerMonitor } from "@editor/services/saasServerMonitor";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";

/**
 * A phone has no bundled backend: the connected server answers its own
 * availability checks, so they can run once that server is reachable.
 */
export function isEndpointCheckBackendOnline(): boolean {
  switch (connectionModeService.getCachedMode()) {
    case "saas":
      return saasServerMonitor.getSnapshot().isOnline;
    case "selfhosted":
      return selfHostedServerMonitor.getSnapshot().isOnline;
    default:
      return false;
  }
}

/** Subscribing also keeps the cloud monitor polling, which runs only while observed. */
export function subscribeToEndpointCheckReadiness(
  onChange: () => void,
): () => void {
  const unsubCloud = saasServerMonitor.subscribe(onChange);
  const unsubServer = selfHostedServerMonitor.subscribe(onChange);
  const unsubMode = connectionModeService.subscribeToModeChanges(onChange);
  return () => {
    unsubCloud();
    unsubServer();
    unsubMode();
  };
}
