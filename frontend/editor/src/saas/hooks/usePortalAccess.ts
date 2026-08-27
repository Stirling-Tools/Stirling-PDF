import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";
import {
  readCachedOtherApp,
  writeCachedOtherApp,
} from "@app/services/navFooterCache";
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
  const processorEnabled = useProcessorEnabled();
  const userId = user?.id ?? null;
  // The query cache is per-tree and per-load, so it can't help a cold start or
  // the hop into the processor, which mounts its own client. Seed from the last
  // answer this browser saw so the switcher and the footer's "Open ..." row are
  // there at first paint. Marked ancient so it still revalidates immediately.
  const [seed] = useState(readCachedOtherApp);

  const { data, isSuccess } = useQuery({
    queryKey: qk.portalAccess(userId),
    queryFn: fetchPortalAccess,
    // Signed out, or no processor on this server: nothing to ask, and any
    // previous answer is void.
    enabled: userId !== null && processorEnabled,
    // Backend unreachable or guest (401) means no access now; a later refetch
    // asks again rather than trusting the failure.
    retry: false,
    initialData: seed,
    initialDataUpdatedAt: 0,
  });

  useEffect(() => {
    // Only a real answer is recorded — a failed probe is not one, so the next
    // mount trusts the last backend response rather than a network blip.
    if (isSuccess && data !== undefined) writeCachedOtherApp(data);
  }, [isSuccess, data]);

  // The localStorage seed outlives the server flag, so re-check it here too.
  return processorEnabled && data === true;
}
