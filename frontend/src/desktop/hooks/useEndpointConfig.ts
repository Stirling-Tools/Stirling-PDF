import { useState, useEffect, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { isBackendNotReadyError } from '@app/constants/backendErrors';
import type { EndpointAvailabilityDetails } from '@app/types/endpointAvailability';
import { connectionModeService } from '@app/services/connectionModeService';
import type { AppConfig } from '@app/contexts/AppConfigContext';


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

async function checkDependenciesReady(): Promise<boolean> {
  try {
    const response = await apiClient.get<AppConfig>('/api/v1/config/app-config', {
      suppressErrorToast: true,
    });
    return response.data?.dependenciesReady ?? false;
  } catch {
    return false;
  }
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
  // DESKTOP: Start optimistically as enabled (most desktop users are in SaaS mode)
  // This prevents UI from being disabled while backend starts or checks are in progress
  const [enabled, setEnabled] = useState<boolean | null>(true);
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

    const dependenciesReady = await checkDependenciesReady();
    if (!dependenciesReady) {
      return; // Health monitor will trigger retry when truly ready
    }

    try {
      setError(null);

      const response = await apiClient.get<boolean>(`/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`, {
        suppressErrorToast: true,
      });

      const locallyEnabled = response.data;

      // DESKTOP ENHANCEMENT: In SaaS mode, assume all endpoints are available
      // Even if not supported locally, they will route to SaaS backend
      if (!locallyEnabled) {
        const mode = await connectionModeService.getCurrentMode();
        if (mode === 'saas') {
          console.debug(`[useEndpointEnabled] Endpoint ${endpoint} not supported locally but available via SaaS routing`);
          setEnabled(true); // Available via SaaS
          return;
        }
      }

      setEnabled(locallyEnabled);
    } catch (err: unknown) {
      const isBackendStarting = isBackendNotReadyError(err);
      const message = getErrorMessage(err);

      if (isBackendStarting) {
        setError(t('backendHealth.starting', 'Backend starting up...'));
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            fetchEndpointStatus();
          }, RETRY_DELAY_MS);
        }
      } else {
        // DESKTOP ENHANCEMENT: In SaaS mode, assume available even on check failure
        const mode = await connectionModeService.getCurrentMode();
        if (mode === 'saas') {
          console.debug(`[useEndpointEnabled] Endpoint ${endpoint} check failed but available via SaaS routing`);
          setEnabled(true); // Available via SaaS
          setError(null);
          return;
        }

        setError(message);
        setEnabled(false);
      }
    } finally {
      setLoading(false);
    }
  }, [endpoint, clearRetryTimeout, t]);

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
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>({});
  const [endpointDetails, setEndpointDetails] = useState<Record<string, EndpointAvailabilityDetails>>({});
  const [loading, setLoading] = useState(true);
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
      setEndpointStatus({});
      setLoading(false);
      return;
    }

    const dependenciesReady = await checkDependenciesReady();
    if (!dependenciesReady) {
      return; // Health monitor will trigger retry when truly ready
    }

    try {
      setError(null);

      const endpointsParam = endpoints.join(',');

      const response = await apiClient.get<Record<string, EndpointAvailabilityDetails>>(
        `/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpointsParam)}`,
        {
          suppressErrorToast: true,
        }
      );

      const details = Object.entries(response.data).reduce((acc, [endpointName, detail]) => {
        acc[endpointName] = {
          enabled: detail?.enabled ?? false,
          reason: detail?.reason ?? null,
        };
        return acc;
      }, {} as Record<string, EndpointAvailabilityDetails>);

      const statusMap = Object.keys(details).reduce((acc, key) => {
        acc[key] = details[key].enabled;
        return acc;
      }, {} as Record<string, boolean>);

      // DESKTOP ENHANCEMENT: In SaaS mode, mark all disabled endpoints as available
      // They will route to SaaS backend
      const mode = await connectionModeService.getCurrentMode();
      if (mode === 'saas') {
        const disabledEndpoints = Object.keys(details).filter(key => !details[key].enabled);

        for (const endpoint of disabledEndpoints) {
          console.debug(`[useMultipleEndpointsEnabled] Endpoint ${endpoint} not supported locally but available via SaaS routing`);
          statusMap[endpoint] = true; // Mark as enabled via SaaS
          details[endpoint] = { enabled: true, reason: null };
        }
      }

      setEndpointDetails(prev => ({ ...prev, ...details }));
      setEndpointStatus(prev => ({ ...prev, ...statusMap }));
    } catch (err: unknown) {
      const isBackendStarting = isBackendNotReadyError(err);
      const message = getErrorMessage(err);

      if (isBackendStarting) {
        setError(t('backendHealth.starting', 'Backend starting up...'));
        if (!retryTimeoutRef.current) {
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            fetchAllEndpointStatuses();
          }, RETRY_DELAY_MS);
        }
      } else {
        setError(message);
        const fallbackStatus = endpoints.reduce((acc, endpointName) => {
          const fallbackDetail: EndpointAvailabilityDetails = { enabled: false, reason: 'UNKNOWN' };
          acc.status[endpointName] = false;
          acc.details[endpointName] = fallbackDetail;
          return acc;
        }, { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> });

        // DESKTOP ENHANCEMENT: In SaaS mode, mark all endpoints as available
        const mode = await connectionModeService.getCurrentMode();
        if (mode === 'saas') {
          for (const endpoint of endpoints) {
            console.debug(`[useMultipleEndpointsEnabled] Endpoint ${endpoint} check failed but available via SaaS routing`);
            fallbackStatus.status[endpoint] = true;
            fallbackStatus.details[endpoint] = { enabled: true, reason: null };
          }
        }

        setEndpointStatus(fallbackStatus.status);
        setEndpointDetails(prev => ({ ...prev, ...fallbackStatus.details }));
      }
    } finally {
      setLoading(false);
    }
  }, [endpoints, clearRetryTimeout, t]);

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
 * - SaaS mode: Uses local bundled backend (from env vars)
 * - Self-hosted mode: Uses configured server URL from connection config
 */
export function useEndpointConfig(): EndpointConfig {
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);

  useEffect(() => {
    connectionModeService.getCurrentConfig()
      .then((config) => {
        if (config.mode === 'selfhosted' && config.server_config?.url) {
          setBackendUrl(config.server_config.url);
        } else {
          // SaaS mode - use default from env vars (local backend)
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
