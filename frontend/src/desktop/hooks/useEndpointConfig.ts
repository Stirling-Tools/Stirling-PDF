import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '@app/services/apiClient';
import { tauriBackendService } from '@app/services/tauriBackendService';

interface EndpointConfig {
  backendUrl: string;
}

const RETRY_DELAY_MS = 2500;

/**
 * Desktop-specific endpoint checker that hits the backend directly via axios.
 */
export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [enabled, setEnabled] = useState<boolean | null>(() => (endpoint ? true : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearRetryTimeout();
    };
  }, [clearRetryTimeout]);

  const fetchEndpointStatus = useCallback(async () => {
    clearRetryTimeout();

    if (!endpoint) {
      if (!isMountedRef.current) return;
      setEnabled(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const response = await apiClient.get<boolean>('/api/v1/config/endpoint-enabled', {
        params: { endpoint },
        suppressErrorToast: true,
      });

      if (!isMountedRef.current) return;
      setEnabled(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unknown error occurred';
      const isBackendStarting = err?.code === 'BACKEND_NOT_READY';
      if (!isMountedRef.current) return;
      setError(isBackendStarting ? 'Backend starting up...' : message);
      setEnabled(true);

      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          void fetchEndpointStatus();
        }, RETRY_DELAY_MS);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [endpoint, clearRetryTimeout]);

  useEffect(() => {
    if (!endpoint) {
      setEnabled(null);
      setLoading(false);
      return;
    }

    if (tauriBackendService.isBackendHealthy()) {
      void fetchEndpointStatus();
    }

    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        void fetchEndpointStatus();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [endpoint, fetchEndpointStatus]);

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
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>(() => {
    if (!endpoints || endpoints.length === 0) return {};
    return endpoints.reduce((acc, endpointName) => {
      acc[endpointName] = true;
      return acc;
    }, {} as Record<string, boolean>);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearRetryTimeout();
    };
  }, [clearRetryTimeout]);

  const fetchAllEndpointStatuses = useCallback(async () => {
    clearRetryTimeout();

    if (!endpoints || endpoints.length === 0) {
      if (!isMountedRef.current) return;
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const endpointsParam = endpoints.join(',');

      const response = await apiClient.get<Record<string, boolean>>('/api/v1/config/endpoints-enabled', {
        params: { endpoints: endpointsParam },
        suppressErrorToast: true,
      });

      if (!isMountedRef.current) return;
      setEndpointStatus(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unknown error occurred';
      const isBackendStarting = err?.code === 'BACKEND_NOT_READY';
      if (!isMountedRef.current) return;
      setError(isBackendStarting ? 'Backend starting up...' : message);

      const fallbackStatus = endpoints.reduce((acc, endpointName) => {
        acc[endpointName] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setEndpointStatus(fallbackStatus);

      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          void fetchAllEndpointStatuses();
        }, RETRY_DELAY_MS);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [endpoints, clearRetryTimeout]);

  useEffect(() => {
    if (!endpoints || endpoints.length === 0) {
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    if (tauriBackendService.isBackendHealthy()) {
      void fetchAllEndpointStatuses();
    }

    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        void fetchAllEndpointStatuses();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [endpoints, fetchAllEndpointStatuses]);

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
