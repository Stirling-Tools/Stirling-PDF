import { useState, useEffect } from 'react';
import { useRequestHeaders } from '@app/hooks/useRequestHeaders';

// Helper to get JWT from localStorage for Authorization header
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('stirling_jwt');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

/**
 * Hook to check if a specific endpoint is enabled
 * This wraps the context for single endpoint checks
 */
export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headers = useRequestHeaders();

  const fetchEndpointStatus = async () => {
    if (!endpoint) {
      setEnabled(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to check endpoint: ${response.status} ${response.statusText}`);
      }

      const isEnabled: boolean = await response.json();
      setEnabled(isEnabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpointStatus();
  }, [endpoint]);

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
export function useMultipleEndpointsEnabled(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedEndpoints, setLastFetchedEndpoints] = useState<string>('');
  const headers = useRequestHeaders();

  const fetchAllEndpointStatuses = async () => {
    const endpointsKey = endpoints.join(',');

    // Skip if we already fetched these exact endpoints
    if (lastFetchedEndpoints === endpointsKey && Object.keys(endpointStatus).length > 0) {
      console.debug('[useEndpointConfig] Already fetched these endpoints, skipping');
      setLoading(false);
      return;
    }
    if (!endpoints || endpoints.length === 0) {
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    // Check if JWT exists - if not, optimistically enable all endpoints
    const hasJwt = !!localStorage.getItem('stirling_jwt');
    if (!hasJwt) {
      console.debug('[useEndpointConfig] No JWT found - optimistically enabling all endpoints');
      const optimisticStatus = endpoints.reduce((acc, endpoint) => {
        acc[endpoint] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setEndpointStatus(optimisticStatus);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use batch API for efficiency
      const endpointsParam = endpoints.join(',');

      const response = await fetch(`/api/v1/config/endpoints-enabled?endpoints=${encodeURIComponent(endpointsParam)}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        // On 401 (auth error), use optimistic fallback instead of disabling
        if (response.status === 401) {
          console.warn('[useEndpointConfig] 401 error - using optimistic fallback');
          const optimisticStatus = endpoints.reduce((acc, endpoint) => {
            acc[endpoint] = true;
            return acc;
          }, {} as Record<string, boolean>);
          setEndpointStatus(optimisticStatus);
          setLoading(false);
          return;
        }
        throw new Error(`Failed to check endpoints: ${response.status} ${response.statusText}`);
      }

      const statusMap: Record<string, boolean> = await response.json();
      setEndpointStatus(statusMap);
      setLastFetchedEndpoints(endpointsKey);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[EndpointConfig] Failed to check multiple endpoints:', err);

      // Fallback: assume all endpoints are enabled on error (optimistic)
      const optimisticStatus = endpoints.reduce((acc, endpoint) => {
        acc[endpoint] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setEndpointStatus(optimisticStatus);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllEndpointStatuses();
  }, [endpoints.join(',')]); // Re-run when endpoints array changes

  // Listen for JWT availability (triggered on login/signup)
  useEffect(() => {
    const handleJwtAvailable = () => {
      console.debug('[useEndpointConfig] JWT available event - refetching endpoints');
      // Reset to allow refetch with JWT
      setLastFetchedEndpoints('');
      fetchAllEndpointStatuses();
    };

    window.addEventListener('jwt-available', handleJwtAvailable);
    return () => window.removeEventListener('jwt-available', handleJwtAvailable);
  }, [endpoints.join(',')]);

  return {
    endpointStatus,
    loading,
    error,
    refetch: fetchAllEndpointStatuses,
  };
}
