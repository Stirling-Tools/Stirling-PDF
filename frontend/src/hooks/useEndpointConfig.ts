import { useState, useEffect } from 'react';
import { makeApiUrl } from '../utils/api';
import { useBackendHealth } from './useBackendHealth';

/**
 * Hook to check if a specific endpoint is enabled
 */
export function useEndpointEnabled(endpoint: string, backendHealthy?: boolean): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEndpointStatus = async () => {
    if (!endpoint) {
      setEnabled(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(makeApiUrl(`/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`));
      
      if (!response.ok) {
        throw new Error(`Failed to check endpoint: ${response.status} ${response.statusText}`);
      }
      
      const isEnabled: boolean = await response.json();
      setEnabled(isEnabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error(`Failed to check endpoint ${endpoint}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch endpoint status if backend is healthy (or if backendHealthy is not provided)
    if (backendHealthy === undefined || backendHealthy === true) {
      fetchEndpointStatus();
    } else {
      // Backend is not healthy, reset state
      setEnabled(null);
      setLoading(false);
      setError('Backend not available');
    }
  }, [endpoint, backendHealthy]);

  return {
    enabled,
    loading,
    error,
    refetch: fetchEndpointStatus,
  };
}

/**
 * Hook to check multiple endpoints at once using batch API
 * Returns a map of endpoint -> enabled status
 */
export function useMultipleEndpointsEnabled(endpoints: string[], backendHealthy?: boolean): {
  endpointStatus: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllEndpointStatuses = async () => {
    if (!endpoints || endpoints.length === 0) {
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use batch API for efficiency
      const endpointsParam = endpoints.join(',');
      const response = await fetch(makeApiUrl(`/api/v1/config/endpoints-enabled?endpoints=${encodeURIComponent(endpointsParam)}`));
      
      if (!response.ok) {
        throw new Error(`Failed to check endpoints: ${response.status} ${response.statusText}`);
      }
      
      const statusMap: Record<string, boolean> = await response.json();
      setEndpointStatus(statusMap);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Failed to check multiple endpoints:', err);
      
      // Fallback: assume all endpoints are disabled on error
      const fallbackStatus = endpoints.reduce((acc, endpoint) => {
        acc[endpoint] = false;
        return acc;
      }, {} as Record<string, boolean>);
      setEndpointStatus(fallbackStatus);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch endpoint statuses if backend is healthy (or if backendHealthy is not provided)
    if (backendHealthy === undefined || backendHealthy === true) {
      fetchAllEndpointStatuses();
    } else {
      // Backend is not healthy, reset state
      setEndpointStatus({});
      setLoading(false);
      setError('Backend not available');
    }
  }, [endpoints.join(','), backendHealthy]); // Re-run when endpoints array changes or backend health changes

  return {
    endpointStatus,
    loading,
    error,
    refetch: fetchAllEndpointStatuses,
  };
}

/**
 * Convenience hook that combines backend health checking with endpoint status checking
 * Only checks endpoint status once backend is healthy
 */
export function useEndpointEnabledWithHealthCheck(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  backendHealthy: boolean;
  refetch: () => Promise<void>;
} {
  const { isHealthy: backendHealthy } = useBackendHealth();
  const { enabled, loading, error, refetch } = useEndpointEnabled(endpoint, backendHealthy);

  return {
    enabled,
    loading,
    error,
    backendHealthy,
    refetch,
  };
}

/**
 * Convenience hook that combines backend health checking with multiple endpoint status checking
 * Only checks endpoint statuses once backend is healthy
 */
export function useMultipleEndpointsEnabledWithHealthCheck(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  backendHealthy: boolean;
  refetch: () => Promise<void>;
} {
  const { isHealthy: backendHealthy } = useBackendHealth();
  const { endpointStatus, loading, error, refetch } = useMultipleEndpointsEnabled(endpoints, backendHealthy);

  return {
    endpointStatus,
    loading,
    error,
    backendHealthy,
    refetch,
  };
}