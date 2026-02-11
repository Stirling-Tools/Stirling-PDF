import { useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';
import type { EndpointAvailabilityDetails } from '@app/types/endpointAvailability';

// Track globally fetched endpoint sets to prevent duplicate fetches across components
const globalFetchedSets = new Set<string>();
const globalEndpointCache: Record<string, EndpointAvailabilityDetails> = {};

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

  const fetchEndpointStatus = async () => {
    if (!endpoint) {
      setEnabled(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.debug('[useEndpointConfig] Fetch endpoint status', { endpoint });

      const response = await apiClient.get<boolean>(`/api/v1/config/endpoint-enabled?endpoint=${encodeURIComponent(endpoint)}`);
      const isEnabled = response.data;
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
  endpointDetails: Record<string, EndpointAvailabilityDetails>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [endpointStatus, setEndpointStatus] = useState<Record<string, boolean>>({});
  const [endpointDetails, setEndpointDetails] = useState<Record<string, EndpointAvailabilityDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllEndpointStatuses = async (force = false) => {
    const endpointsKey = [...endpoints].sort().join(',');

    // Skip if we already fetched these exact endpoints globally
    if (!force && globalFetchedSets.has(endpointsKey)) {
      console.debug('[useEndpointConfig] Already fetched these endpoints globally, using cache');
      const cached = endpoints.reduce(
        (acc, endpoint) => {
          const cachedDetails = globalEndpointCache[endpoint];
          if (cachedDetails) {
            acc.status[endpoint] = cachedDetails.enabled;
            acc.details[endpoint] = cachedDetails;
          }
          return acc;
        },
        { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> }
      );
      setEndpointStatus(cached.status);
      setEndpointDetails(prev => ({ ...prev, ...cached.details }));
      setLoading(false);
      return;
    }
    if (!endpoints || endpoints.length === 0) {
      setEndpointStatus({});
      setEndpointDetails({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.debug('[useEndpointConfig] Fetching endpoint statuses', { count: endpoints.length, force });

      // Check which endpoints we haven't fetched yet
      const newEndpoints = endpoints.filter(ep => !(ep in globalEndpointCache));
      if (newEndpoints.length === 0) {
        console.debug('[useEndpointConfig] All endpoints already in global cache');
        const cached = endpoints.reduce(
          (acc, endpoint) => {
            const cachedDetails = globalEndpointCache[endpoint];
            if (cachedDetails) {
              acc.status[endpoint] = cachedDetails.enabled;
              acc.details[endpoint] = cachedDetails;
            }
            return acc;
          },
          { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> }
        );
        setEndpointStatus(cached.status);
        setEndpointDetails(prev => ({ ...prev, ...cached.details }));
        globalFetchedSets.add(endpointsKey);
        setLoading(false);
        return;
      }

      // Use batch API for efficiency - only fetch new endpoints
      const endpointsParam = newEndpoints.join(',');

      const response = await apiClient.get<Record<string, EndpointAvailabilityDetails>>(`/api/v1/config/endpoints-availability?endpoints=${encodeURIComponent(endpointsParam)}`);
      const statusMap = response.data;

      // Update global cache with new results
      Object.entries(statusMap).forEach(([endpoint, details]) => {
        globalEndpointCache[endpoint] = {
          enabled: details?.enabled ?? true,
          reason: details?.reason ?? null,
        };
      });

      // Get all requested endpoints from cache (including previously cached ones)
      const fullStatus = endpoints.reduce(
        (acc, endpoint) => {
          const cachedDetails = globalEndpointCache[endpoint];
          if (cachedDetails) {
            acc.status[endpoint] = cachedDetails.enabled;
            acc.details[endpoint] = cachedDetails;
          } else {
            acc.status[endpoint] = true;
          }
          return acc;
        },
        { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> }
      );

      setEndpointStatus(fullStatus.status);
      setEndpointDetails(prev => ({ ...prev, ...fullStatus.details }));
      globalFetchedSets.add(endpointsKey);
    } catch (err: any) {
      // On 401 (auth error), use optimistic fallback instead of disabling
      if (err.response?.status === 401) {
        console.warn('[useEndpointConfig] 401 error - using optimistic fallback');
        const optimisticStatus = endpoints.reduce(
          (acc, endpoint) => {
            const optimisticDetails: EndpointAvailabilityDetails = { enabled: true, reason: null };
            acc.status[endpoint] = true;
            acc.details[endpoint] = optimisticDetails;
            globalEndpointCache[endpoint] = optimisticDetails;
            return acc;
          },
          { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> }
        );
        setEndpointStatus(optimisticStatus.status);
        setEndpointDetails(prev => ({ ...prev, ...optimisticStatus.details }));
        setLoading(false);
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('[EndpointConfig] Failed to check multiple endpoints:', err);

      // Fallback: assume all endpoints are enabled on error (optimistic)
      const optimisticStatus = endpoints.reduce(
        (acc, endpoint) => {
          const optimisticDetails: EndpointAvailabilityDetails = { enabled: true, reason: null };
          acc.status[endpoint] = true;
          acc.details[endpoint] = optimisticDetails;
          return acc;
        },
        { status: {} as Record<string, boolean>, details: {} as Record<string, EndpointAvailabilityDetails> }
      );
      setEndpointStatus(optimisticStatus.status);
      setEndpointDetails(prev => ({ ...prev, ...optimisticStatus.details }));
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
      console.debug('[useEndpointConfig] JWT available event - clearing cache for refetch with auth');
      // Clear the global cache to allow refetch with JWT
      globalFetchedSets.clear();
      Object.keys(globalEndpointCache).forEach(key => delete globalEndpointCache[key]);
      fetchAllEndpointStatuses(true);
    };

    window.addEventListener('jwt-available', handleJwtAvailable);
    return () => window.removeEventListener('jwt-available', handleJwtAvailable);
  }, [endpoints.join(',')]);

  return {
    endpointStatus,
    endpointDetails,
    loading,
    error,
    refetch: () => fetchAllEndpointStatuses(true),
  };
}
