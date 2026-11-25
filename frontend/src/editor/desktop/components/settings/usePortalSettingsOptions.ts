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
 * Stirling Cloud as on web SaaS, without the roster; a self-hosted server as
 * on web self-hosted. Billing stays the browser handoff in configNavSections,
 * and account linking is not offered.
 */
export function usePortalSettingsOptions(): PortalSettingsOptions | null {
  const mode = useConnectionMode();
  const connected = useConnectedServer();
  const { granted: portalAccess } = usePortalAccessState();
  const { isAdmin, loading } = useAuth();
  const { config } = useAppConfig();
  const rosterAvailable = useRosterAvailable();

  return useMemo(() => {
    if (!connected) return null;
    if (mode === "saas") {
      return {
        includeRoster: false,
        includeApiKeys: portalAccess,
        includeAudit: portalAccess,
        includeEncryption: false,
        includeBilling: false,
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
        includeBilling: false,
        includeAccountLink: false,
      };
    }
    return null;
  }, [
    connected,
    mode,
    rosterAvailable,
    portalAccess,
    config?.enableLogin,
    isAdmin,
    loading,
  ]);
}
