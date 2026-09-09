import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  fetchPipelines,
  type PipelinesOverviewResponse,
} from "@processor/api/pipelines";

/** Base query: the pipelines overview (GET /api/v1/policies/overview). */
export function usePipelines(): AsyncState<PipelinesOverviewResponse> {
  return toAsyncState(
    useQuery({ queryKey: qk.pipelines(), queryFn: fetchPipelines }),
  );
}
