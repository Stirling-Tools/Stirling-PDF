import { useSyncExternalStore } from "react";
import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
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
 * while enabled.
 */
export function useSigningBadgeCount(): number {
  const enabled = useGroupSigningEnabled();
  const { signRequests, mySessions } = useSigningSessions({
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
      request.myStatus !== "SIGNED" && request.myStatus !== "DECLINED",
  ).length;

  const ownerUpdates = mySessions.filter(
    (session) =>
      !session.finalized &&
      session.signedCount > getLastSeenSignedCount(session.sessionId),
  ).length;

  return incoming + ownerUpdates;
}
