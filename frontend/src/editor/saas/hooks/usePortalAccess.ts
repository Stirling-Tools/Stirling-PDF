import { useEffect, useState } from "react";
import apiClient from "@editor/services/apiClient";
import { useAuth } from "@editor/auth/UseSession";

/**
 * Whether the current user can open the processor (admin portal), straight
 * from the backend (`/api/v1/auth/me` → `portalAccess`) — the same signal the
 * processor's own SaasPortalGate uses. Components that must mirror processor
 * access (e.g. the sidebar's editor⇄processor switcher) ask here.
 *
 * The editor's Supabase auth context can't *answer* this — it never fetches
 * /me — so it is used only to identify who is asking. Keying the effect on
 * that identity is what keeps the answer per-user: the SPA can swap users
 * without a reload (Supabase fires SIGNED_OUT/SIGNED_IN in place; only the
 * settings Logout button hard-navigates), so any answer held beyond the
 * current identity would leak to whoever signs in next.
 *
 * Deliberately unmemoised beyond the mount: the one consumer (the sidebar
 * switcher) mounts once, so a cross-mount cache would only add user-scoped
 * state that has to be invalidated on identity change — the bug class this
 * hook already had once. Guests skip the request entirely.
 */
export function usePortalAccess(): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [access, setAccess] = useState(false);

  useEffect(() => {
    // Signed out: nothing to ask, and any previous answer is void.
    if (userId === null) {
      setAccess(false);
      return;
    }

    let cancelled = false;
    apiClient
      .get<{ user?: { portalAccess?: boolean } }>("/api/v1/auth/me")
      .then((res) => {
        if (!cancelled) setAccess(res.data.user?.portalAccess === true);
      })
      .catch(() => {
        // Backend unreachable or guest (401): no access now; a remount or
        // identity change asks again rather than trusting a failure.
        if (!cancelled) setAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return access;
}
