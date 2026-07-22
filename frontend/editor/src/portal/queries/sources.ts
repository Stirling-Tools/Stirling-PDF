import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import { fetchSources, type SourcesResponse } from "@portal/api/sources";
import {
  fetchS3Connections,
  type IntegrationConfig,
} from "@portal/api/integrations";

/** Base query: configured sources (GET /api/v1/sources). Shared by Sources,
 *  Home's ProcessorFlow, the pipeline/policy builders' source pickers. */
export function useSources(): AsyncState<SourcesResponse> {
  return toAsyncState(
    useQuery({ queryKey: qk.sources(), queryFn: fetchSources }),
  );
}

/** Base query: S3 connection configs (GET /api/v1/integrations). */
export function useS3Connections(): AsyncState<IntegrationConfig[]> {
  return toAsyncState(
    useQuery({ queryKey: qk.s3Connections(), queryFn: fetchS3Connections }),
  );
}
