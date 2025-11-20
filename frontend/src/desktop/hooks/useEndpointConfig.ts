import { useState, useEffect, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { isBackendNotReadyError } from '@app/constants/backendErrors';
import type { EndpointAvailabilityDetails } from '@app/types/endpointAvailability';
import { connectionModeService } from '@desktop/services/connectionModeService';


interface EndpointConfig {
  backendUrl: string;
}

const RETRY_DELAY_MS = 2500;

function getErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    if (typeof data?.message === 'string') {
      return data.message;
    }
    return err.message || 'Unknown error occurred';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Unknown error occurred';
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
  const { t } = useTranslation();
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
    } catch (err: unknown) {
      const isBackendStarting = isBackendNotReadyError(err);
      const message = getErrorMessage(err);
      if (!isMountedRef.current) return;
      setError(isBackendStarting ? t('backendHealth.starting', 'Backend starting up...') : message);
      setEnabled(true);

      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          fetchEndpointStatus();
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
      fetchEndpointStatus();
    }

    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        fetchEndpointStatus();
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
  endpointDetails: Record<string, EndpointAvailabilityDetails>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { t } = useTranslation();
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>(() => {
    if (!endpoints || endpoints.length === 0) return {};
    return endpoints.reduce((acc, endpointName) => {
      acc[endpointName] = true;
      return acc;
    }, {} as Record<string, boolean>);
  });
  const [endpointDetails, setEndpointDetails] = useState<Record<string, EndpointAvailabilityDetails>>({});
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

      const response = await apiClient.get<Record<string, EndpointAvailabilityDetails>>('/api/v1/config/endpoints-availability', {
        params: { endpoints: endpointsParam },
        suppressErrorToast: true,
      });

      if (!isMountedRef.current) return;
      const details = Object.entries(response.data).reduce((acc, [endpointName, detail]) => {
        acc[endpointName] = {
          enabled: detail?.enabled ?? true,
          reason: detail?.reason ?? null,
        };
        return acc;
      }, {} as Record<string, EndpointAvailabilityDetails>);

      const statusMap = Object.keys(details).reduce((acc, key) => {
        acc[key] = details[key].enabled;
        return acc;
      }, {} as Record<string, boolean>);

      setEndpointDetails(prev => ({ ...prev, ...details }));
      setEndpointStatus(statusMap);
    } catch (err: unknown) {
      const isBackendStarting = isBackendNotReadyError(err);
      const message = getErrorMessage(err);
      if (!isMountedRef.current) return;
      setError(isBackendStarting ? t('backendHealth.starting', 'Backend starting up...') : message);

      const fallbackStatus = endpoints.reduce((acc, endpointName) => {
        const fallbackDetail: EndpointAvailabilityDetails = { enabled: true, reason: null };
        acc.status[endpointName] = true;
        acc.details[endpointName] = fallbackDetail;
        return acc;
      }, { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> });
      setEndpointStatus(fallbackStatus.status);
      setEndpointDetails(prev => ({ ...prev, ...fallbackStatus.details }));

      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          fetchAllEndpointStatuses();
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
      setEndpointDetails({});
      setLoading(false);
      return;
    }

    if (tauriBackendService.isBackendHealthy()) {
      fetchAllEndpointStatuses();
    }

    const unsubscribe = tauriBackendService.subscribeToStatus((status) => {
      if (status === 'healthy') {
        fetchAllEndpointStatuses();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [endpoints, fetchAllEndpointStatuses]);

  return {
    endpointStatus,
    endpointDetails,
    loading,
    error,
    refetch: fetchAllEndpointStatuses,
  };
}

// Default backend URL from environment variables
const DEFAULT_BACKEND_URL =
  import.meta.env.VITE_DESKTOP_BACKEND_URL
  || import.meta.env.VITE_API_BASE_URL
  || '';

/**
 * Desktop override exposing the backend URL based on connection mode.
 * - Offline mode: Uses local bundled backend (from env vars)
 * - Server mode: Uses configured server URL from connection config
 */
export function useEndpointConfig(): EndpointConfig {
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);

  useEffect(() => {
    connectionModeService.getCurrentConfig()
      .then((config) => {
        if (config.mode === 'server' && config.server_config?.url) {
          setBackendUrl(config.server_config.url);
        } else {
          // Offline mode - use default from env vars
          setBackendUrl(DEFAULT_BACKEND_URL);
        }
      })
      .catch((err) => {
        console.error('Failed to get connection config:', err);
        // Keep current URL on error
      });
  }, []);

  return { backendUrl };
}
