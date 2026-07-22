import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, type AsyncState } from "@portal/hooks/useAsync";
import { toAsyncState } from "@portal/queries/adapters";
import { qk } from "@portal/queries/keys";
import { usersBackend } from "@app/portal/usersBackend";
import { fetchGrants, type ResourceGrant } from "@portal/api/access";
import { usersCapabilities as caps } from "@app/portal/usersCapabilities";
import type { AdminAuthConfig, UsersResponse } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

/**
 * The Users page's data contract, independent of HOW it's fetched. Two hooks
 * satisfy it — {@link useUsersDataLegacy} (the current fetch-on-mount useAsync
 * path) and {@link useUsersDataQuery} (TanStack Query) — so the presentational
 * <UsersView> can be driven by either, gated on the `reactQuery` dev flag. Both
 * expose the same {@link AsyncState} shape the view already understood.
 */
export interface UsersData {
  usersState: AsyncState<UsersResponse>;
  grantsState: AsyncState<ResourceGrant[]>;
  teamsState: AsyncState<Team[]>;
  authState: AsyncState<AdminAuthConfig>;
  /** Resync roster + grants + teams after a mutation (not auth config). */
  refresh: () => void;
}

// Grants are ADMIN-only; on flavors that can't manage them, resolve empty
// rather than hitting the endpoint — same guard the legacy view used inline.
const fetchGrantsOrEmpty = (): Promise<ResourceGrant[]> =>
  caps.manageGrants ? fetchGrants("PORTAL") : Promise.resolve([]);

// ── Legacy: fetch-on-mount, no cache. Refetches on every remount. ────────────
export function useUsersDataLegacy(): UsersData {
  const { tier } = useTier();
  const [refreshKey, setRefreshKey] = useState(0);

  const usersState = useAsync<UsersResponse>(
    () => usersBackend.fetchUsers(tier),
    [tier, refreshKey],
  );
  const grantsState = useAsync<ResourceGrant[]>(fetchGrantsOrEmpty, [
    tier,
    refreshKey,
  ]);
  const teamsState = useAsync<Team[]>(
    () => usersBackend.fetchTeams(),
    [tier, refreshKey],
  );
  const authState = useAsync<AdminAuthConfig>(
    () => usersBackend.fetchAuthConfig(),
    [],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return { usersState, grantsState, teamsState, authState, refresh };
}

// ── TanStack Query: shared cache above the router, dedup, bg revalidation. ───
export function useUsersDataQuery(): UsersData {
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

  // Targeted invalidation replaces the legacy refreshKey bump. Auth config is
  // left alone (the legacy view never refetched it on refresh either). teamMy
  // is the shared SaaS team-directory entry both roster + teams derive from
  // (see the /team/my collapse) — invalidate it so a mutation forces a real
  // re-resolve rather than serving the stale cached team.
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
