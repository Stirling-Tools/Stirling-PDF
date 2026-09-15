import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/**
 * Whether this desktop is confirmed to be talking to a Stirling server — SaaS or self-hosted —
 * rather than to the backend it ships with.
 *
 * The bundled backend is built by {@code .taskfiles/desktop.yml} with
 * {@code DISABLE_ADDITIONAL_FEATURES: "true"}, which leaves {@code :proprietary} out of the jar. A
 * server has it. So a surface that reads a proprietary endpoint may mount here only once the mode
 * is known to be remote.
 *
 * Starts pessimistically FALSE for the same reason as {@link useConfirmedSaaSMode}: an optimistic
 * start mounts the gated surface on cold start and fires its mount fetch at the local backend
 * before the real mode arrives, which is the request the gate exists to prevent.
 */
export function useConfirmedRemoteMode(): boolean {
  const [isRemote, setIsRemote] = useState(false);

  useEffect(() => {
    void connectionModeService
      .getCurrentMode()
      .then((mode) => setIsRemote(mode === "saas" || mode === "selfhosted"));
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setIsRemote(cfg.mode === "saas" || cfg.mode === "selfhosted"),
    );
  }, []);

  return isRemote;
}
