import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { qk } from "@app/query/keys";

async function fetchPortalAccess(): Promise<boolean> {
  const res = await apiClient.get<{ user?: { portalAccess?: boolean } }>(
    "/api/v1/auth/me",
  );
  return res.data.user?.portalAccess === true;
}

/**
 * Whether the current user can open the processor (admin portal), straight
 * from the backend (`/api/v1/auth/me` → `portalAccess`) — the same signal the
 * processor's own SaasPortalGate uses. Components that must mirror processor
 * access (the sidebar's editor⇄processor switcher and its footer row) ask here.
 *
 * The editor's Supabase auth context can't *answer* this — it never fetches
 * /me — so it is used only to identify who is asking. That identity is the
 * cache key, which is what keeps the answer per-user: the SPA can swap users
 * without a reload (Supabase fires SIGNED_OUT/SIGNED_IN in place; only the
 * settings Logout button hard-navigates), and a keyed cache addresses each
 * identity separately rather than holding one answer that would have to be
 * invalidated on the swap — the bug class this hook once had.
 *
 * Cached through the app query client, so leaving the editor for the processor
 * and coming back resolves from cache: the switcher is there on first paint
 * instead of appearing a request later. Guests skip the request entirely.
 */
export function usePortalAccess(): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery({
    queryKey: qk.portalAccess(userId),
    queryFn: fetchPortalAccess,
    // Signed out: nothing to ask, and any previous answer is void.
    enabled: userId !== null,
    // Backend unreachable or guest (401) means no access now; a later refetch
    // asks again rather than trusting the failure.
    retry: false,
  });

  return data === true;
}
