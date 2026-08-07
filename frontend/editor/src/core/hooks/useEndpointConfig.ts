import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EndpointAvailabilityDetails } from "@app/types/endpointAvailability";
import { editorQk } from "@app/queries/keys";
import {
  fetchEndpointsAvailability,
  pickEndpointDetails,
} from "@app/queries/endpoints";

function useInvalidateEndpoints(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: editorQk.endpointsAvailability(),
    });
  }, [queryClient]);
}

export function useEndpointEnabled(endpoint: string): {
  enabled: boolean | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const refetch = useInvalidateEndpoints();
  const query = useQuery({
    queryKey: editorQk.endpointsAvailability(),
    queryFn: fetchEndpointsAvailability,
    enabled: !!endpoint,
    staleTime: 60_000,
  });

  if (!endpoint) {
    return { enabled: null, loading: false, error: null, refetch };
  }

  return {
    enabled: query.isPending ? null : (query.data?.[endpoint]?.enabled ?? true),
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refetch,
  };
}

export function useMultipleEndpointsEnabled(endpoints: string[]): {
  endpointStatus: Record<string, boolean>;
  endpointDetails: Record<string, EndpointAvailabilityDetails>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const refetch = useInvalidateEndpoints();
  const endpointsKey = endpoints.join("\0");
  const sortedEndpoints = useMemo(() => [...endpoints].sort(), [endpointsKey]);

  const query = useQuery({
    queryKey: editorQk.endpointsAvailability(),
    queryFn: fetchEndpointsAvailability,
    enabled: endpoints.length > 0,
    staleTime: 60_000,
  });

  const resolved = useMemo(() => {
    if (sortedEndpoints.length === 0) return { status: {}, details: {} };
    if (query.isError && !query.data) {
      return pickEndpointDetails(undefined, sortedEndpoints);
    }
    return pickEndpointDetails(query.data, sortedEndpoints);
  }, [sortedEndpoints, query.data, query.isError]);

  if (endpoints.length === 0) {
    return {
      endpointStatus: {},
      endpointDetails: {},
      loading: false,
      error: null,
      refetch,
    };
  }

  return {
    endpointStatus: resolved.status,
    endpointDetails: resolved.details,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    refetch,
  };
}
