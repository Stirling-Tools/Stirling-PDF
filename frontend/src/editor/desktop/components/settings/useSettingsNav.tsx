import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@editor-core/components/settings/useSettingsNav";
import type { SettingsNav } from "@editor/components/settings/settingsNavTypes";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useAuth } from "@editor/auth/context";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useRosterAvailable } from "@editor/hooks/useRosterAvailable";
import { useConnectionMode } from "@editor/hooks/useConnectionMode";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import { connectionModeService } from "@editor/services/connectionModeService";
import { mergeSettingsGroups } from "@editor/components/settings/mergeSettingsGroups";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  portalSupersededSectionKeys,
} from "@editor/components/settings/portalSettingsNav";

export type { SettingsNav };

/**
 * Desktop settings: the build's own sections plus the processor's, by the
 * rules of the edition the connection runs - Stirling Cloud as on web SaaS, a
 * self-hosted server as on web self-hosted. Billing is the browser handoff in
 * configNavSections.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const mode = useConnectionMode();
  const connected = useConnectedServer();
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const { isAdmin, loading } = useAuth();
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
        includeBilling: false,
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
        includeBilling: false,
        includeAccountLink: false,
      });
    }
    return [];
  }, [
    connected,
    mode,
    rosterAvailable,
    portalAccess,
    config?.enableLogin,
    isAdmin,
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
  const hasBilling = sections.some((group) =>
    group.items.some((item) => item.key === "billing"),
  );
  if (hasBilling) {
    aliases.plan = "billing";
    aliases.adminPlan = "billing";
  } else {
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
