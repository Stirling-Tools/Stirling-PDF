import { useQuery } from "@tanstack/react-query";
import { qk } from "@processor/queries/keys";
import { toAsyncState } from "@processor/queries/adapters";
import type { AsyncState } from "@processor/hooks/useAsync";
import { usersBackend } from "@app/processor/usersBackend";
import type { UsersResponse } from "@processor/api/users";
import type { Tier } from "@processor/contexts/TierContext";

/**
 * Base query: the org roster (flavor-resolved via usersBackend). Keyed the same
 * as the Users view's roster query (qk.usersRoster), so callers share one cache
 * entry — the roster is fetched once across all of them.
 */
export function useUsersRoster(tier: Tier): AsyncState<UsersResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.usersRoster(tier),
      queryFn: () => usersBackend.fetchUsers(tier),
    }),
  );
}
