import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectionModeService } from "@editor/services/connectionModeService";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";

/**
 * Drops cached responses when the backend behind them changes. operationRouter
 * resolves the same path to the bundled backend, a self-hosted server or SaaS,
 * so a mode switch or the server going up/down invalidates every key.
 */
export function DesktopQueryCacheReset() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // resetQueries, not clear(): clear() evicts without notifying mounted
    // observers, so a panel keeps rendering the old backend's answer.
    const reset = () => void queryClient.resetQueries();
    const unsubscribeMode = connectionModeService.subscribeToModeChanges(reset);

    // idle/checking say nothing about reachability — treating them as "not
    // offline" would reset on offline→checking and then skip the real recovery.
    let wasOffline: boolean | null = null;
    const unsubscribeServer = selfHostedServerMonitor.subscribe(
      ({ status }) => {
        if (status !== "online" && status !== "offline") return;
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
