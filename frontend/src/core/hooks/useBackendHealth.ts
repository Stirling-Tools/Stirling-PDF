import type { BackendHealthState } from '@app/types/backendHealth';

export function useBackendHealth(): BackendHealthState {
  return {
    status: 'healthy',
    message: null,
    error: null,
    isHealthy: true,
  };
}
