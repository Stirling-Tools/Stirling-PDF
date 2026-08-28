import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@app/query/keys";
import {
  userManagementService,
  type AdminSettingsData,
} from "@app/services/userManagementService";
import {
  teamService,
  type Team,
  type TeamDetailsUIResponse,
} from "@app/services/teamService";

/**
 * The people and teams an admin screen reads. Three sections read overlapping
 * slices of it, so they share these keys rather than each holding a copy.
 *
 * `enabled` is the login-enabled gate: with login off the endpoints are not
 * callable and the sections render example data instead.
 */
export function useAdminUsers(enabled: boolean) {
  return useQuery<AdminSettingsData>({
    queryKey: qk.adminUsers(),
    queryFn: () => userManagementService.getUsers(),
    enabled,
  });
}

export function useTeams(enabled: boolean) {
  return useQuery<Team[]>({
    queryKey: qk.teams(),
    queryFn: () => teamService.getTeams(),
    enabled,
  });
}

export function useTeamDetails(teamId: number, enabled: boolean) {
  return useQuery<TeamDetailsUIResponse>({
    queryKey: qk.teamDetails(teamId),
    queryFn: () => teamService.getTeamDetails(teamId),
    enabled,
  });
}

/**
 * Imperative read, for flows that fetch before opening a modal. Serves the
 * same cache entry the sections render from, so an already-loaded directory
 * costs nothing.
 */
export function useFetchAdminUsers() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.fetchQuery<AdminSettingsData>({
        queryKey: qk.adminUsers(),
        queryFn: () => userManagementService.getUsers(),
      }),
    [queryClient],
  );
}

/**
 * Invalidates all three keys after a write. Membership moves change a team's
 * count, a user's team and the detail rows at once, so narrowing this per
 * operation would mean re-deriving that mapping at every call site. Only
 * mounted queries refetch; the rest are marked stale for their next mount.
 */
export function useInvalidateAdminDirectory() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.adminUsers() });
    queryClient.invalidateQueries({ queryKey: qk.teams() });
    queryClient.invalidateQueries({ queryKey: ["editor", "teamDetails"] });
  }, [queryClient]);
}
