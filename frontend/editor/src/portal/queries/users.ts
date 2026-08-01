import { useQuery } from "@tanstack/react-query";
import { qk } from "@portal/queries/keys";
import { toAsyncState } from "@portal/queries/adapters";
import type { AsyncState } from "@portal/hooks/useAsync";
import { usersBackend } from "@app/portal/usersBackend";
import type { UsersResponse } from "@portal/api/users";
import type { Tier } from "@portal/contexts/TierContext";

/**
 * Base query: the org roster (flavor-resolved via usersBackend). Keyed the same
 * as the Users view's roster query (qk.usersRoster), so Home's onboarding read
 * and the Users page share one cache entry — the roster is fetched once across
 * both. Used by useOnboardingProgress.
 */
export function useUsersRoster(tier: Tier): AsyncState<UsersResponse> {
  return toAsyncState(
    useQuery({
      queryKey: qk.usersRoster(tier),
      queryFn: () => usersBackend.fetchUsers(tier),
    }),
  );
}
