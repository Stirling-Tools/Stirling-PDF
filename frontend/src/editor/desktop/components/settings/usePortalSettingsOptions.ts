import { useMemo } from "react";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useAuth } from "@editor/auth/context";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useRosterAvailable } from "@editor/hooks/useRosterAvailable";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import type { PortalSettingsOptions } from "@editor/components/settings/portalSettingsNav";

/**
 * Desktop: the rules of the edition the connection runs, none in local mode.
 * Stirling Cloud as on web SaaS, a self-hosted server as on web self-hosted.
 * Usage & Billing is the only billing page in both: every signed-in Stirling
 * Cloud member gets it (purchases stay leader-only inside it), and on a
 * self-hosted server the organisation owner does, with the account connection.
 */
export function usePortalSettingsOptions(): PortalSettingsOptions | null {
  const mode = useConnectionMode();
  const connected = useConnectedServer();
  const { granted: portalAccess } = usePortalAccessState();
  const { isAdmin, isAnonymous, user, loading } = useAuth();
  const isOwner = isAdmin && !loading && user?.orgOwner === true;
  const { config } = useAppConfig();
  const rosterAvailable = useRosterAvailable();

  return useMemo(() => {
    if (!connected) return null;
    if (mode === "saas") {
      return {
        includeRoster: rosterAvailable && portalAccess,
        includeApiKeys: portalAccess,
        includeAudit: portalAccess,
        includeEncryption: false,
        includeBilling: !isAnonymous,
        includeAccountLink: false,
      };
    }
    if (mode === "selfhosted") {
      return {
        // Admin-only, as on web self-hosted: processor access alone does not open it.
        includeRoster:
          rosterAvailable &&
          config?.enableLogin === true &&
          isAdmin &&
          !loading,
        includeApiKeys: portalAccess,
        includeEncryption: portalAccess && isAdmin,
        includeBilling: isOwner,
        includeAccountLink: isOwner,
      };
    }
    return null;
  }, [
    connected,
    mode,
    rosterAvailable,
    portalAccess,
    isAnonymous,
    config?.enableLogin,
    isAdmin,
    isOwner,
    loading,
  ]);
}
