import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tauriBackendService } from "@app/services/tauriBackendService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { isBackendNotReadyError } from "@app/constants/backendErrors";
import { connectionModeService } from "@app/services/connectionModeService";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import {
  isSelfHostedOffline,
  resolveEndpointEnabled,
  resolveEndpointsAvailability,
} from "@app/api/endpointAvailability";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

interface EndpointConfig {
  backendUrl: string;
}

const RETRY_DELAY_MS = 2500;
const OPTIMISTIC: EndpointAvailabilityDetails = { enabled: true, reason: null };

// Booleans, not the monitors' state objects — those are reassigned every poll,
// which would defeat useSyncExternalStore's identity check.
const subscribeReadiness = (onChange: () => void) => {
  const unsubBackend = tauriBackendService.subscribeToStatus(onChange);
  const unsubServer = selfHostedServerMonitor.subscribe(onChange);
  return () => {
    unsubBackend();
    unsubServer();
  };
};
const getBackendOnline = () => tauriBackendService.isOnline;
const getOffline = () => isSelfHostedOffline();

/**
 * When the desktop backend is reachable: either the bundled backend is healthy,
 * or the self-hosted server is offline but the local one answers. A query only
 * runs once this is true, and a change re-runs it — which is how a reconnect
 * swaps the offline local-check answer for the live remote one.
 */
function useBackendReadiness() {
  const backendOnline = useSyncExternalStore(
    subscribeReadiness,
    getBackendOnline,
  );
  const offline = useSyncExternalStore(subscribeReadiness, getOffline);
  return { ready: backendOnline || offline, backendOnline, offline };
}

const retryWhileStarting = (_count: number, error: unknown) =>
  isBackendNotReadyError(error);

/** Desktop override: hits the backend directly, optimistic while it boots. */
export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { ready, backendOnline, offline } = useBackendReadiness();
  const queryKey = qk.endpointEnabled(endpoint);

  const { data, refetch } = useQuery({
    queryKey,
    queryFn: () => resolveEndpointEnabled(endpoint),
    enabled: Boolean(endpoint) && ready,
    staleTime: CONFIG_STALE_TIME,
    retry: retryWhileStarting,
    retryDelay: RETRY_DELAY_MS,
  });

  // Re-run only when readiness or the endpoint changes; queryClient/queryKey
  // are stable and deliberately excluded.
  useEffect(() => {
    if (ready) void queryClient.invalidateQueries({ queryKey });
  }, [backendOnline, offline, endpoint]);

  return {
    enabled: endpoint ? (data ?? true) : null,
    // Optimistic by design: the desktop endpoint check never blocks the UI.
    loading: false,
    error: null,
    refetch: useCallback(async () => {
      await refetch();
    }, [refetch]),
  };
}

export function useMultipleEndpointsEnabled(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  endpointDetails: Record<string, EndpointAvailabilityDetails>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { ready, backendOnline, offline } = useBackendReadiness();
  const wanted = endpoints ?? [];
  const key = wanted.join(",");
  const queryKey = qk.endpointsAvailability();

  const { data, isPending, refetch } = useQuery({
    queryKey,
    // key drives the legacy fallback param and the offline per-endpoint checks;
    // the shared cache entry is still the whole map, projected per consumer.
    queryFn: () => resolveEndpointsAvailability(key ? key.split(",") : []),
    enabled: wanted.length > 0 && ready,
    staleTime: CONFIG_STALE_TIME,
    retry: retryWhileStarting,
    retryDelay: RETRY_DELAY_MS,
  });

  // A reconnect (readiness flips) forces the swap from offline to remote data.
  useEffect(() => {
    if (ready) void queryClient.invalidateQueries({ queryKey });
  }, [backendOnline, offline]);

  const projected = useMemo(() => {
    const status: Record<string, boolean> = {};
    const details: Record<string, EndpointAvailabilityDetails> = {};
    if (!data) return { status, details };
    for (const endpoint of key ? key.split(",") : []) {
      const detail = data[endpoint] ?? OPTIMISTIC;
      status[endpoint] = detail.enabled;
      details[endpoint] = detail;
    }
    return { status, details };
  }, [data, key]);

  return {
    endpointStatus: projected.status,
    endpointDetails: projected.details,
    loading: wanted.length > 0 && isPending,
    error: null,
    refetch: useCallback(async () => {
      await refetch();
    }, [refetch]),
  };
}

// Default backend URL from environment variables
const DEFAULT_BACKEND_URL =
  import.meta.env.VITE_DESKTOP_BACKEND_URL || import.meta.env.VITE_API_BASE_URL;

/**
 * Desktop override exposing the backend URL based on connection mode.
 * - SaaS mode: Uses local bundled backend (from env vars)
 * - Self-hosted mode: Uses configured server URL from connection config
 */
export function useEndpointConfig(): EndpointConfig {
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);

  useEffect(() => {
    connectionModeService
      .getCurrentConfig()
      .then((config) => {
        if (config.mode === "selfhosted" && config.server_config?.url) {
          setBackendUrl(config.server_config.url);
        } else {
          // SaaS mode - use default from env vars (local backend)
          setBackendUrl(DEFAULT_BACKEND_URL);
        }
      })
      .catch((err) => {
        console.error("Failed to get connection config:", err);
        // Keep current URL on error
      });
  }, []);

  return { backendUrl };
}
