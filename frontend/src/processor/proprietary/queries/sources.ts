import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import { fetchSources, type SourcesResponse } from "@processor/api/sources";

/** Base query: configured sources (GET /api/v1/sources). Shared by Sources,
 *  Home's ProcessorFlow, the pipeline/policy builders' source pickers. */
export function useSources(): AsyncState<SourcesResponse> {
  return toAsyncState(
    useQuery({ queryKey: qk.sources(), queryFn: fetchSources }),
  );
}
