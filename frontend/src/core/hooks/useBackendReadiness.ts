export interface BackendReadiness {
  ready: boolean;
  status: 'healthy' | 'starting' | 'unhealthy';
  message: string | null;
}

/**
 * Core/web builds do not depend on an embedded backend, so we always report ready.
 */
export function useBackendReadiness(): BackendReadiness {
  return {
    ready: true,
    status: 'healthy',
    message: null,
  };
}
