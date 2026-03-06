import { useEffect, useState, useCallback } from 'react';
import { backendHealthMonitor } from '@app/services/backendHealthMonitor';
import { selfHostedServerMonitor } from '@app/services/selfHostedServerMonitor';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { connectionModeService } from '@app/services/connectionModeService';
import type { BackendHealthState } from '@app/types/backendHealth';

/**
 * Hook to read the shared backend health monitor state.
 * All consumers subscribe to a single poller managed by backendHealthMonitor.
 *
 * In self-hosted mode when the remote server is offline, reports healthy if the
 * local bundled backend port is known — the operation router will route supported
 * tools to local, so the Run button should remain enabled.
 */
export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealthState>(() => backendHealthMonitor.getSnapshot());
  const [serverStatus, setServerStatus] = useState(
    () => selfHostedServerMonitor.getSnapshot().status
  );
  const [localUrl, setLocalUrl] = useState<string | null>(
    () => tauriBackendService.getBackendUrl()
  );
  const [connectionMode, setConnectionMode] = useState<string | null>(null);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
  }, []);

  useEffect(() => {
    return backendHealthMonitor.subscribe(setHealth);
  }, []);

  useEffect(() => {
    return selfHostedServerMonitor.subscribe(state => setServerStatus(state.status));
  }, []);

  // Re-read local URL when tauriBackendService emits a status event.
  // waitForPort() broadcasts the current status once the port is discovered,
  // so this will fire when the local backend becomes reachable.
  useEffect(() => {
    return tauriBackendService.subscribeToStatus(() => {
      setLocalUrl(tauriBackendService.getBackendUrl());
    });
  }, []);

  const checkHealth = useCallback(async () => {
    return backendHealthMonitor.checkNow();
  }, []);

  // When self-hosted server is confirmed offline but the local backend port is
  // known, treat the backend as healthy so the Run button stays enabled.
  // The operation router handles routing supported tools to local.
  const isHealthy =
    (connectionMode === 'selfhosted' && serverStatus === 'offline' && !!localUrl) ||
    health.isHealthy;

  return {
    ...health,
    isHealthy,
    checkHealth,
  };
}
