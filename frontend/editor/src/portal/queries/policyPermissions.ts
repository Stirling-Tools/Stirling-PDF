import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { fetchPolicyPermissions } from "@portal/api/pipelines";

/**
 * Whether the current user may create or modify org-mandated (required) policies - an admin
 * self-hosted, a team leader on SaaS. Mirrors the backend gate so the UI matches what a save would
 * actually be allowed to do. Defaults to false while loading (controls start locked, then unlock for
 * a manager) so a non-manager never briefly sees an enabled control they can't use.
 */
export function useCanManagePolicies(): boolean {
  const { data } = useQuery({
    queryKey: qk.policyPermissions(),
    queryFn: fetchPolicyPermissions,
    staleTime: 5 * 60 * 1000,
  });
  return data?.canManagePolicies ?? false;
}
