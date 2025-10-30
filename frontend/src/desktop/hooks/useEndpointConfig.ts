import { useMemo } from 'react';

export {
  useEndpointEnabled,
  useMultipleEndpointsEnabled,
} from '../../core/hooks/useEndpointConfig';

interface EndpointConfig {
  backendUrl: string;
}

/**
 * Desktop override that exposes the backend URL used by the embedded server.
 */
export function useEndpointConfig(): EndpointConfig {
  const backendUrl = useMemo(() => {
    const runtimeEnv = typeof process !== 'undefined' ? process.env : undefined;

    return runtimeEnv?.STIRLING_BACKEND_URL
      || import.meta.env.VITE_DESKTOP_BACKEND_URL
      || import.meta.env.VITE_API_BASE_URL
      || 'http://localhost:8080';
  }, []);

  return { backendUrl };
}
