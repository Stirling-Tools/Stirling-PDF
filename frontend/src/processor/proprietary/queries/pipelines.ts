import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
} from "@portal/api/pipelines";

/** Base query: the pipelines overview (GET /api/v1/policies/overview). */
export function usePipelines(): AsyncState<PipelinesOverviewResponse> {
  return toAsyncState(
    useQuery({ queryKey: qk.pipelines(), queryFn: fetchPipelines }),
  );
}
