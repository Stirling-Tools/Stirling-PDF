import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
} from "@processor/api/pipelines";

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
