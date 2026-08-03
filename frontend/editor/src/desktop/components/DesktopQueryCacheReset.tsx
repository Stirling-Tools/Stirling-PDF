import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectionModeService } from "@app/services/connectionModeService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";

/**
 * Discards cached responses when the backend they came from stops being the one
 * the app talks to.
 *
 * A key does not pin a backend on desktop: operationRouter resolves the same
 * path to the bundled backend, a self-hosted server or the SaaS backend. Two
 * things move that target — a connection-mode switch, and the self-hosted
 * server going up or down, which reroutes with no mode event.
 *
 * resetQueries, not clear(): clear() evicts without notifying mounted
 * observers, so a panel keeps rendering the old backend's answer.
 */
export function DesktopQueryCacheReset() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const reset = () => void queryClient.resetQueries();
    const unsubscribeMode = connectionModeService.subscribeToModeChanges(reset);

    // Only offline<->reachable matters; the monitor also emits idle and
    // checking, and replays current state on subscribe.
    let wasOffline: boolean | null = null;
    const unsubscribeServer = selfHostedServerMonitor.subscribe(
      ({ status }) => {
        const isOffline = status === "offline";
        if (wasOffline !== null && wasOffline !== isOffline) reset();
        wasOffline = isOffline;
      },
    );

    return () => {
      unsubscribeMode();
      unsubscribeServer();
    };
  }, [queryClient]);

  return null;
}
