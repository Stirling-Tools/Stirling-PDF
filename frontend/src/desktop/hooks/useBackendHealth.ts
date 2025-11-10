import { useEffect, useState, useCallback } from 'react';
import { backendHealthMonitor } from '@app/services/backendHealthMonitor';
import type { BackendHealthState } from '@app/types/backendHealth';

/**
 * Hook to read the shared backend health monitor state.
 * All consumers subscribe to a single poller managed by backendHealthMonitor.
 */
export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealthState>(() => backendHealthMonitor.getSnapshot());

  useEffect(() => {
    return backendHealthMonitor.subscribe(setHealth);
  }, []);

  const checkHealth = useCallback(async () => {
    return backendHealthMonitor.checkNow();
  }, []);

  return {
    ...health,
    checkHealth,
  };
}
