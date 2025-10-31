import { useMemo, useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';

interface EndpointConfig {
  backendUrl: string;
}

/**
 * Desktop-specific endpoint checker that hits the backend directly via axios.
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
      const message = err?.response?.data?.message || err?.message || 'Unknown error occurred';
      setError(message);
      setEnabled(null);
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

export function useMultipleEndpointsEnabled(endpoints: string[]): {
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

      const endpointsParam = endpoints.join(',');

      const response = await apiClient.get<Record<string, boolean>>('/api/v1/config/endpoints-enabled', {
        params: { endpoints: endpointsParam },
      });

      setEndpointStatus(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unknown error occurred';
      setError(message);

      const fallbackStatus = endpoints.reduce((acc, endpointName) => {
        acc[endpointName] = false;
        return acc;
      }, {} as Record<string, boolean>);
      setEndpointStatus(fallbackStatus);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllEndpointStatuses();
  }, [endpoints.join(',')]);

  return {
    endpointStatus,
    loading,
    error,
    refetch: fetchAllEndpointStatuses,
  };
}

/**
 * Desktop override exposing the backend URL used by the embedded server.
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
