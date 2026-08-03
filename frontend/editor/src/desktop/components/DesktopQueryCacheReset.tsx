import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectionModeService } from "@app/services/connectionModeService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";

/**
 * Discards cached responses when the backend they came from stops being the one
 * the app talks to.
 *
 * Query caches by key, but on desktop a key does not pin a backend:
 * operationRouter resolves the same relative path to the local bundled backend,
 * a self-hosted server or the SaaS backend. Two things move that target — an
 * explicit connection-mode switch, and the self-hosted server going up or down,
 * which reroutes endpoints to the local fallback with no mode event.
 *
 * resetQueries rather than clear(): clear() evicts entries without notifying
 * mounted observers, so a panel keeps rendering the old backend's answer until
 * something unrelated re-renders it. resetQueries notifies and refetches what is
 * on screen.
 */
export function DesktopQueryCacheReset() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const reset = () => void queryClient.resetQueries();

    const unsubscribeMode = connectionModeService.subscribeToModeChanges(reset);

    // Only offline↔reachable matters — the monitor also emits idle and
    // checking, and subscribe() replays current state on attach.
    let wasOffline: boolean | null = null;
    const unsubscribeServer = selfHostedServerMonitor.subscribe(
      ({ status }) => {
        const isOffline = status === "offline";
        const flipped = wasOffline !== null && wasOffline !== isOffline;
        wasOffline = isOffline;
        if (flipped) reset();
      },
    );

    return () => {
      unsubscribeMode();
      unsubscribeServer();
    };
  }, [queryClient]);

  return null;
}
