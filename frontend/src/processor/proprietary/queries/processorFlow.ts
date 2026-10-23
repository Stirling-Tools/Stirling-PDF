import { useMemo } from "react";
import { usePoliciesList, usePolicyRuns } from "@processor/queries/policies";
import { useSources } from "@processor/queries/sources";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  assembleProcessorFlow,
  type ProcessorFlow,
} from "@processor/api/processorFlow";

/**
 * Home's sources → policies → outcomes visualiser, composed from the shared
 * base queries so it reuses Home's cache entries instead of refetching them.
 */
export function useProcessorFlow(): AsyncState<ProcessorFlow> {
  const sources = useSources();
  const list = usePoliciesList();
  const runs = usePolicyRuns();
  const data = useMemo(
    () =>
      sources.data && list.data
        ? assembleProcessorFlow(sources.data, list.data, runs.data ?? [])
        : null,
    [sources.data, list.data, runs.data],
  );
  return {
    data,
    loading: sources.loading || list.loading,
    error: sources.error ?? list.error,
  };
}
