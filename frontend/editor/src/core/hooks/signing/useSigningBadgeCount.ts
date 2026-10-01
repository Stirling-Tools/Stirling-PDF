import { useMemo, useSyncExternalStore } from "react";
import {
  collectSigningItems,
  signingAction,
  type SigningMenuItem,
} from "@app/utils/signingItems";
import { useAuth } from "@app/auth/UseSession";
import { useGroupSigningState } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import {
  getLastSeenSignedCount,
  getSigningSeenVersion,
  subscribeSigningSeen,
} from "@app/services/signingSeenStore";

/**
 * The badge and Needs action list share the same classified snapshot: requests
 * to sign, new owner signatures to review, and fully signed sessions to finalize.
 * Zero when group signing is disabled. Polls in the background
 * while enabled. Unsettled while auth, config or sessions load, or the session
 * lookup fails; consumers may retain their previous count until it settles.
 */
export function useSigningBadgeState(): {
  count: number;
  settled: boolean;
  items: SigningMenuItem[];
} {
  const { loading: authLoading } = useAuth();
  const { enabled, settled: availabilitySettled } = useGroupSigningState();
  const { signRequests, mySessions, settled } = useSigningSessions({
    enabled,
    autoRefreshInterval: enabled ? 60000 : 0,
  });

  const seenVersion = useSyncExternalStore(
    subscribeSigningSeen,
    getSigningSeenVersion,
    getSigningSeenVersion,
  );

  const items = useMemo(
    () =>
      enabled
        ? collectSigningItems(signRequests, mySessions).map((item) => ({
            ...item,
            action: signingAction(item, getLastSeenSignedCount(item.sessionId)),
          }))
        : [],
    [enabled, signRequests, mySessions, seenVersion],
  );

  return {
    items,
    count: items.filter((item) => item.action !== null).length,
    settled: !authLoading && availabilitySettled && (!enabled || settled),
  };
}

/** Count without loading status; requests with no cached sessions report zero. */
export function useSigningBadgeCount(): number {
  return useSigningBadgeState().count;
}
