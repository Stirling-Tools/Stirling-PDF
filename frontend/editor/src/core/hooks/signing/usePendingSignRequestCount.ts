import { useGroupSigningEnabled } from "@app/hooks/useGroupSigningEnabled";
import { useSigningSessions } from "@app/hooks/signing/useSigningSessions";

/** Count of sign requests awaiting the user's signature; 0 when group signing is disabled. Polls in the background while enabled. */
export function usePendingSignRequestCount(): number {
  const enabled = useGroupSigningEnabled();
  const { signRequests } = useSigningSessions({
    enabled,
    autoRefreshInterval: enabled ? 60000 : 0,
  });
  return signRequests.filter(
    (request) =>
      request.myStatus !== "SIGNED" && request.myStatus !== "DECLINED",
  ).length;
}
