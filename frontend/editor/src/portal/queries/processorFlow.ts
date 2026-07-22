import { useMemo } from "react";
import { usePoliciesList, usePolicyRuns } from "@portal/queries/policies";
import { useSources } from "@portal/queries/sources";
import type { AsyncState } from "@portal/hooks/useAsync";
import {
  assembleProcessorFlow,
  type ProcessorFlow,
} from "@portal/api/processorFlow";

/**
 * Derived: Home's sources → policies → outcomes visualiser. Composes the shared
 * sources + policies-list + policy-runs base queries and assembles client-side,
 * so it reuses the same cache entries as the rest of Home (killing the
 * duplicate /sources, /policies, /policies/runs fetches) rather than issuing
 * its own via fetchProcessorFlow.
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
