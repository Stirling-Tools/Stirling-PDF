import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import { fetchSources, type SourcesResponse } from "@portal/api/sources";

/** Base query: configured sources (GET /api/v1/sources). Shared by Sources,
 *  Home's ProcessorFlow, the pipeline/policy builders' source pickers. */
export function useSources(): AsyncState<SourcesResponse> {
  return toAsyncState(
    useQuery({ queryKey: qk.sources(), queryFn: fetchSources }),
  );
}
