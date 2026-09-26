import { useSyncExternalStore } from "react";
import { useAuth } from "@app/auth/UseSession";
import { useGroupSigningState } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";
import {
  getLastSeenSignedCount,
  getSigningSeenVersion,
  subscribeSigningSeen,
} from "@app/services/signingSeenStore";

/**
 * Count that drives the Shared Signing badge: sign requests awaiting the user's
 * signature, plus the user's own sessions that gained new signatures since they
 * last opened them. 0 when group signing is disabled. Polls in the background
 * while enabled. Unsettled while auth, config or sessions load, or the session
 * lookup fails; consumers may retain their previous count until it settles.
 */
export function useSigningBadgeState(): { count: number; settled: boolean } {
  const { loading: authLoading } = useAuth();
  const { enabled, settled: availabilitySettled } = useGroupSigningState();
  const { signRequests, mySessions, settled } = useSigningSessions({
    enabled,
    autoRefreshInterval: enabled ? 60000 : 0,
  });

  // Re-read the per-session "seen" markers whenever they change.
  useSyncExternalStore(
    subscribeSigningSeen,
    getSigningSeenVersion,
    getSigningSeenVersion,
  );

  const incoming = signRequests.filter(
    (request) =>
      !request.finalized &&
      request.myStatus !== "SIGNED" &&
      request.myStatus !== "DECLINED",
  ).length;

  const ownerUpdates = mySessions.filter(
    (session) =>
      !session.finalized &&
      session.signedCount > getLastSeenSignedCount(session.sessionId),
  ).length;

  return {
    count: enabled ? incoming + ownerUpdates : 0,
    settled: !authLoading && availabilitySettled && (!enabled || settled),
  };
}

/** Count without loading status; requests with no cached sessions report zero. */
export function useSigningBadgeCount(): number {
  return useSigningBadgeState().count;
}
