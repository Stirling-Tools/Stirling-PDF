import type { BackendHealthState } from '@app/types/backendHealth';

export function useBackendHealth(): BackendHealthState {
  return {
    status: 'healthy',
    message: null,
    isChecking: false,
    lastChecked: Date.now(),
    error: null,
    isHealthy: true,
  };
}
