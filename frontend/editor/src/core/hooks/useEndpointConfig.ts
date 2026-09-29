import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchEndpointEnabled,
  fetchEndpointsAvailability,
} from "@app/api/config";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";
import { useJwtConfigSync } from "@app/hooks/useJwtConfigSync";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";

const OPTIMISTIC: EndpointAvailabilityDetails = { enabled: true, reason: null };

function message(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "Unknown error occurred";
}

/** Whether one endpoint is enabled. `null` while loading and on failure. */
export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: qk.endpointEnabled(endpoint),
    queryFn: () => fetchEndpointEnabled(endpoint),
    enabled: Boolean(endpoint),
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    enabled: data ?? null,
    loading: Boolean(endpoint) && isPending,
    error: message(error),
    refetch: useCallback(async () => {
      await refetch();
    }, [refetch]),
  };
}

/**
 * Availability for a set of endpoints, projected from one shared request for
 * the whole map. Unknown endpoints and any failure read as enabled — this runs
 * before auth settles, and disabling every tool on a hiccup is worse than
 * letting a call fail later.
 */
export function useMultipleEndpointsEnabled(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  endpointDetails: Record<string, EndpointAvailabilityDetails>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const wanted = endpoints ?? [];

  const { data, isPending, error, refetch } = useQuery({
    queryKey: qk.endpointsAvailability(),
    queryFn: fetchEndpointsAvailability,
    enabled: wanted.length > 0,
    staleTime: CONFIG_STALE_TIME,
    // A failure already falls back to enabled, so a retry buys nothing and
    // doubles a request that fires on load for every logged-out visitor.
    retry: false,
  });

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useJwtConfigSync(
    useCallback(() => {
      void queryClient.invalidateQueries({
        queryKey: qk.endpointsAvailability(),
      });
    }, [queryClient]),
  );

  const key = wanted.join(",");
  const projected = useMemo(() => {
    const status: Record<string, boolean> = {};
    const details: Record<string, EndpointAvailabilityDetails> = {};
    if (!data && !error) return { status, details };
    for (const endpoint of key ? key.split(",") : []) {
      const detail = data?.[endpoint] ?? OPTIMISTIC;
      status[endpoint] = detail.enabled;
      details[endpoint] = detail;
    }
    return { status, details };
  }, [data, error, key]);

  return {
    endpointStatus: projected.status,
    endpointDetails: projected.details,
    loading: wanted.length > 0 && isPending,
    error: message(error),
    refetch: reload,
  };
}
