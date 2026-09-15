import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTier } from "@processor/contexts/TierContext";
import type { AsyncState } from "@processor/hooks/useAsync";
import { toAsyncState } from "@processor/queries/adapters";
import { qk } from "@processor/queries/keys";
import { usersBackend } from "@app/processor/usersBackend";
import { fetchGrants, type ResourceGrant } from "@processor/api/access";
import { usersCapabilities as caps } from "@app/processor/usersCapabilities";
import type { AdminAuthConfig, UsersResponse } from "@processor/api/users";
import type { Team } from "@processor/api/teams";

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
