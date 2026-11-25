import { useMemo } from "react";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useAuth } from "@editor/auth/context";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useRosterAvailable } from "@editor/hooks/useRosterAvailable";
import type { PortalSettingsOptions } from "@editor/components/settings/portalSettingsNav";

/**
 * Which of the processor's sections self-hosted settings carry; null for none.
 * Admins manage encryption; only the organization owner manages billing and
 * the Stirling account connection. Portal access alone grants neither.
 */
export function usePortalSettingsOptions(): PortalSettingsOptions | null {
  const { granted: portalAccess } = usePortalAccessState();
  const { isAdmin, user, loading } = useAuth();
  const isOwner = isAdmin && !loading && user?.orgOwner === true;
  const { config } = useAppConfig();
  const rosterAvailable = useRosterAvailable();

  return useMemo(
    () => ({
      // The roster is this build's only one, so it does not wait on processor
      // access the way the processor's own surfaces do.
      includeRoster:
        rosterAvailable && config?.enableLogin === true && isAdmin && !loading,
      includeApiKeys: portalAccess,
      includeEncryption: portalAccess && isAdmin,
      includeBilling: portalAccess && isOwner,
      includeAccountLink: portalAccess && isOwner,
    }),
    [
      portalAccess,
      isAdmin,
      isOwner,
      loading,
      config?.enableLogin,
      rosterAvailable,
    ],
  );
}
