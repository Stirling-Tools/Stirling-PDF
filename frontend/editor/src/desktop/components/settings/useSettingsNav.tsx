import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@core/components/settings/useSettingsNav";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { useAuth } from "@app/auth/context";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useRosterAvailable } from "@app/hooks/useRosterAvailable";
import { useConnectionMode } from "@app/hooks/useConnectionMode";
import { useConnectedServer } from "@app/hooks/useConnectedServer";
import { connectionModeService } from "@app/services/connectionModeService";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  portalSupersededSectionKeys,
} from "@app/components/settings/portalSettingsNav";

export type { SettingsNav };

/**
 * Desktop settings: the build's own sections plus the processor's, by the
 * rules of the edition the connection runs - Stirling Cloud as on web SaaS, a
 * self-hosted server as on web self-hosted. Usage & Billing is the only billing
 * page in both: every signed-in Stirling Cloud member gets it (purchases stay
 * leader-only inside it), and on a self-hosted server the organisation owner
 * does.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const mode = useConnectionMode();
  const connected = useConnectedServer();
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const { isAdmin, isAnonymous, user, loading } = useAuth();
  const isOwner = isAdmin && !loading && user?.orgOwner === true;
  const { config } = useAppConfig();
  const rosterAvailable = useRosterAvailable();

  // A failed lookup still settles: the nav then shows only what needs no server.
  const [connectionReady, setConnectionReady] = useState(false);
  useEffect(() => {
    let active = true;
    void connectionModeService
      .getCurrentMode()
      .catch(() => undefined)
      .finally(() => {
        if (active) setConnectionReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const portalSections = useMemo(() => {
    if (!connected) return [];
    if (mode === "saas") {
      return buildPortalSettingsSections(t, {
        includeRoster: rosterAvailable && portalAccess,
        includeApiKeys: portalAccess,
        includeAudit: portalAccess,
        includeEncryption: false,
        includeBilling: !isAnonymous,
        includeAccountLink: false,
      });
    }
    if (mode === "selfhosted") {
      return buildPortalSettingsSections(t, {
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
      });
    }
    return [];
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
    t,
  ]);

  const sections = useMemo(
    () =>
      mergeSettingsGroups(base.sections, portalSections, [
        "plan",
        "adminPlan",
        ...portalSupersededSectionKeys(portalSections),
      ]),
    [base.sections, portalSections],
  );

  const aliases = { ...base.aliases };
  if (portalSections.length > 0) Object.assign(aliases, PORTAL_SECTION_ALIASES);
  const hasRoster = portalSections.some((group) =>
    group.items.some((item) => item.key === "users"),
  );
  if (!hasRoster) {
    delete aliases.people;
    delete aliases.teams;
  }
  const hasBilling = portalSections.some((group) =>
    group.items.some((item) => item.key === "billing"),
  );
  if (!hasBilling) {
    delete aliases.plan;
    delete aliases.adminPlan;
  }

  return {
    ...base,
    sections,
    pending: !connectionReady || !accessSettled || loading,
    aliases,
  };
}
