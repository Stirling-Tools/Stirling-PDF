import { useCallback, useMemo } from 'react';

type BackendStatus = 'healthy' | 'unknown';

interface BackendHealthState {
  status: BackendStatus;
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  checkHealth: () => void;
}

/**
 * Web implementation: assume backend is available (browser shares origin).
 * Desktop overrides replace this hook with a real health poller.
 */
export function useBackendHealth(): BackendHealthState {
  const state = useMemo(() => ({
    status: 'healthy' as BackendStatus,
    isHealthy: true,
    isChecking: false,
    error: null,
  }), []);

  const checkHealth = useCallback(() => {
    // Web build relies on the browser origin proxy – nothing to do here.
  }, []);

  return {
    ...state,
    checkHealth,
  };
}
