import { useEffect, useState, useCallback } from 'react';
import { backendHealthMonitor, BackendHealthSnapshot } from '@app/services/backendHealthMonitor';

/**
 * Hook to read the shared backend health monitor state.
 * All consumers subscribe to a single poller managed by backendHealthMonitor.
 */
export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealthSnapshot>(() => backendHealthMonitor.getSnapshot());

  useEffect(() => {
    return backendHealthMonitor.subscribe(setHealth);
  }, []);

  const checkHealth = useCallback(async () => {
    return backendHealthMonitor.checkNow();
  }, []);

  return {
    ...health,
    isHealthy: health.status === 'healthy',
    checkHealth,
  };
}
