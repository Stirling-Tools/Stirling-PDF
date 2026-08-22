import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import {
  assemblePolicies,
  fetchPoliciesList,
  fetchPolicyRuns,
  type PoliciesResponse,
  type PolicyRunView,
  type WirePolicy,
} from "@processor/api/policies";

/** Base query: the flat stored-policy records (GET /api/v1/policies). */
export function usePoliciesList(): AsyncState<WirePolicy[]> {
  return toAsyncState(
    useQuery({ queryKey: qk.policiesList(), queryFn: fetchPoliciesList }),
  );
}

/** Base query: policy run history (GET /api/v1/policies/runs). */
export function usePolicyRuns(): AsyncState<PolicyRunView[]> {
  return toAsyncState(
    useQuery({ queryKey: qk.policyRuns(), queryFn: fetchPolicyRuns }),
  );
}

/**
 * The decorated catalogue Policies and Home both render, composed from the two
 * shared base queries so /policies and /policies/runs are fetched once across
 * all consumers.
 */
export function usePoliciesOverview(): AsyncState<PoliciesResponse> {
  const list = usePoliciesList();
  const runs = usePolicyRuns();
  const data = useMemo(
    () => (list.data ? assemblePolicies(list.data, runs.data ?? []) : null),
    [list.data, runs.data],
  );
  return { data, loading: list.loading, error: list.error };
}
