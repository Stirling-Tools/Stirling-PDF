import { useState, useEffect } from 'react';
import { useBackendHealth } from './useBackendHealth';
import apiClient from '../services/apiClient';

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

      const response = await apiClient.get<boolean>('/api/v1/config/endpoint-enabled', {
        params: { endpoint },
      });

      setEnabled(response.data);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error occurred';
      setError(errorMessage);
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

      const response = await apiClient.get<Record<string, boolean>>('/api/v1/config/endpoints-enabled', {
        params: { endpoints: endpointsParam },
      });

      setEndpointStatus(response.data);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error occurred';
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
