import { useMemo } from "react";
import {
  collectSigningItems,
  type SigningMenuItem,
} from "@editor/utils/signingItems";
import { useAuth } from "@editor/auth/UseSession";
import { useGroupSigningState } from "@editor/hooks/useGroupSigningEnabled";
import { useSigningSessions } from "@editor/hooks/signing/useSigningSessions";
import { useSigningActivity } from "@editor/hooks/signing/useSigningActivity";

/**
 * Counts unread invitations, participant decisions and completed documents.
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

  const sessions = useMemo(
    () => (enabled ? collectSigningItems(signRequests, mySessions) : []),
    [enabled, signRequests, mySessions],
  );
  const items = useSigningActivity(sessions);

  return {
    items,
    count: items.filter((item) => item.unread).length,
    settled: !authLoading && availabilitySettled && (!enabled || settled),
  };
}

/** Count without loading status; requests with no cached sessions report zero. */
export function useSigningBadgeCount(): number {
  return useSigningBadgeState().count;
}
