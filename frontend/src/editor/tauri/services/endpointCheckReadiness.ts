import { tauriBackendService } from "@editor/services/tauriBackendService";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";

/**
 * Whether the backend that answers endpoint-availability checks is up. Here that is
 * the bundled backend in every connection mode: it fronts the checks even while a
 * self-hosted server is connected. A platform without one shadows this module.
 */
export function isEndpointCheckBackendOnline(): boolean {
  return tauriBackendService.isOnline;
}

/** Fires whenever {@link isEndpointCheckBackendOnline} or self-hosted reachability may have changed. */
export function subscribeToEndpointCheckReadiness(
  onChange: () => void,
): () => void {
  const unsubBackend = tauriBackendService.subscribeToStatus(onChange);
  const unsubServer = selfHostedServerMonitor.subscribe(onChange);
  return () => {
    unsubBackend();
    unsubServer();
  };
}
