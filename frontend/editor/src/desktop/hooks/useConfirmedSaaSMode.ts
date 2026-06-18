import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Like {@link useSaaSMode}, but starts pessimistically FALSE: it returns true
 * only once the connection mode has been CONFIRMED to be "saas".
 *
 * Use this to gate mounting components that fire a network call on mount — the
 * cloud team context, the Policies rail + auto-run controller. useSaaSMode()
 * starts optimistically true (right for tool-availability UX, where a flash of
 * "unavailable" is worse than a flash of "available"), but for a network-
 * triggering gate that optimism leaks a request: the gated surface mounts on
 * cold start, fires its mount fetch against the local/self-hosted backend, and
 * only then unmounts when the real mode resolves. Starting false closes that
 * window — nothing mounts (and nothing fetches) until we KNOW we're in SaaS.
 */
export function useConfirmedSaaSMode(): boolean {
  const [isSaaSMode, setIsSaaSMode] = useState(false);

  useEffect(() => {
    void connectionModeService
      .getCurrentMode()
      .then((mode) => setIsSaaSMode(mode === "saas"));
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setIsSaaSMode(cfg.mode === "saas"),
    );
  }, []);

  return isSaaSMode;
}
