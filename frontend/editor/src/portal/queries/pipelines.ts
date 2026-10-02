import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
} from "@portal/api/pipelines";

/**
 * Base query: the pipelines overview (GET /api/v1/policies/overview). `enabled: false` is for
 * views a visitor without portal access also sees, where the call would only 401.
 */
export function usePipelines(
  options: { enabled?: boolean } = {},
): AsyncState<PipelinesOverviewResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.pipelines(),
      queryFn: fetchPipelines,
      enabled: options.enabled ?? true,
    }),
  );
}
