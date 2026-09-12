import { useSyncExternalStore } from "react";
import {
  getPortalSaasSessionState,
  subscribePortalSaasSession,
} from "@portal/auth/portalSaasSession";

/** Reactive browser authorization, independent of the instance's link status. */
export function usePortalSaasSession() {
  return useSyncExternalStore(
    subscribePortalSaasSession,
    getPortalSaasSessionState,
  );
}
