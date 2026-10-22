import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { fetchPolicyPermissions } from "@portal/api/pipelines";

export interface PolicyPermissionsState {
  canManage: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Mirrors the backend policy-management gate so the UI matches what a save would actually allow. */
export function useCanManagePolicies(): PolicyPermissionsState {
  const query = useQuery({
    queryKey: qk.policyPermissions(),
    queryFn: fetchPolicyPermissions,
    staleTime: 5 * 60 * 1000,
  });
  return {
    canManage: query.data?.canManagePolicies ?? false,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
