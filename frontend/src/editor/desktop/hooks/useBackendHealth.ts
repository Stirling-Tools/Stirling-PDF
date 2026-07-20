import { useEffect, useState, useCallback } from "react";
import { backendHealthMonitor } from "@editor/services/backendHealthMonitor";
import { selfHostedServerMonitor } from "@editor/services/selfHostedServerMonitor";
import { tauriBackendService } from "@editor/services/tauriBackendService";
import { connectionModeService } from "@editor/services/connectionModeService";
import type { BackendHealthState } from "@editor/types/backendHealth";

/**
 * Hook to read backend health state for UI (Run button, BackendHealthIndicator).
 *
 * backendHealthMonitor tracks the local bundled backend.
 * selfHostedServerMonitor tracks the remote server in self-hosted mode.
 *
 * isOnline logic:
 * - SaaS mode: true when local backend is healthy
 * - Self-hosted mode (server online): true (remote is up)
 * - Self-hosted mode (server offline, local port known): true so the Run button
 *   stays enabled — operationRouter routes supported tools to local
 * - Self-hosted mode (server offline, local port unknown): false
 */
export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealthState>(() =>
    backendHealthMonitor.getSnapshot(),
  );
  const [serverStatus, setServerStatus] = useState(
    () => selfHostedServerMonitor.getSnapshot().status,
  );
  const [localUrl, setLocalUrl] = useState<string | null>(() =>
    tauriBackendService.getBackendUrl(),
  );
  const [connectionMode, setConnectionMode] = useState<string | null>(null);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((config) =>
      setConnectionMode(config.mode),
    );
  }, []);

  useEffect(() => {
    return backendHealthMonitor.subscribe(setHealth);
  }, []);

  useEffect(() => {
    return selfHostedServerMonitor.subscribe((state) =>
      setServerStatus(state.status),
    );
  }, []);

  useEffect(() => {
    return tauriBackendService.subscribeToStatus(() => {
      setLocalUrl(tauriBackendService.getBackendUrl());
    });
  }, []);

  const checkHealth = useCallback(async () => {
    return backendHealthMonitor.checkNow();
  }, []);

  const isOnline =
    connectionMode === "selfhosted"
      ? serverStatus !== "offline" || !!localUrl
      : health.isOnline;

  return {
    ...health,
    isOnline,
    checkHealth,
  };
}
