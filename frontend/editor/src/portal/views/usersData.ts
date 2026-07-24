import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTier } from "@portal/contexts/TierContext";
import type { AsyncState } from "@portal/hooks/useAsync";
import { toAsyncState } from "@portal/queries/adapters";
import { qk } from "@portal/queries/keys";
import { usersBackend } from "@app/portal/usersBackend";
import { fetchGrants, type ResourceGrant } from "@portal/api/access";
import { usersCapabilities as caps } from "@app/portal/usersCapabilities";
import type { AdminAuthConfig, UsersResponse } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

/** The four resources the Users page renders, plus a post-mutation refresh. */
export interface UsersData {
  usersState: AsyncState<UsersResponse>;
  grantsState: AsyncState<ResourceGrant[]>;
  teamsState: AsyncState<Team[]>;
  authState: AsyncState<AdminAuthConfig>;
  refresh: () => void;
}

// Grants are ADMIN-only; resolve empty on flavors that can't manage them.
const fetchGrantsOrEmpty = (): Promise<ResourceGrant[]> =>
  caps.manageGrants ? fetchGrants("PORTAL") : Promise.resolve([]);

export function useUsersData(): UsersData {
  const { tier } = useTier();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: qk.usersRoster(tier),
    queryFn: () => usersBackend.fetchUsers(tier),
  });
  const grantsQuery = useQuery({
    queryKey: qk.usersGrants(tier),
    queryFn: fetchGrantsOrEmpty,
  });
  const teamsQuery = useQuery({
    queryKey: qk.usersTeams(tier),
    queryFn: () => usersBackend.fetchTeams(),
  });
  const authQuery = useQuery({
    queryKey: qk.usersAuthConfig(),
    queryFn: () => usersBackend.fetchAuthConfig(),
  });

  // Auth config is deliberately not invalidated (it never changes via these
  // mutations); teamMy is the shared SaaS entry roster + teams both derive from.
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.usersRoster(tier) });
    queryClient.invalidateQueries({ queryKey: qk.usersGrants(tier) });
    queryClient.invalidateQueries({ queryKey: qk.usersTeams(tier) });
    queryClient.invalidateQueries({ queryKey: qk.teamMy() });
  }, [queryClient, tier]);

  return {
    usersState: toAsyncState(usersQuery),
    grantsState: toAsyncState(grantsQuery),
    teamsState: toAsyncState(teamsQuery),
    authState: toAsyncState(authQuery),
    refresh,
  };
}
